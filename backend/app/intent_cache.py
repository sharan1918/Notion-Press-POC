"""
Semantic intent cache using ChromaDB.

Stores past email classification results keyed by email text embeddings.
When a near-duplicate email arrives (cosine similarity >= threshold),
the cached classification is returned instantly, skipping the LLM entirely.

Cache invalidation: When a human correction is stored, any cached entries
for that intent category are removed to prevent stale results.
"""

import os
import hashlib
import threading
import logging
import json
from typing import Optional

from app.chroma_client import get_shared_chroma_client
from app.models import Email, EmailClassification, FastPathResult
from app.config import INTENT_CACHE_SIMILARITY_THRESHOLD

logger = logging.getLogger(__name__)

DEFAULT_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")


class IntentCache:
    """
    Persistent semantic cache for email classifications.

    Uses ChromaDB with cosine distance metric. Shares the same ChromaDB
    persistent directory as FeedbackStore but uses a separate collection.
    """

    def __init__(
        self,
        persist_directory: str = DEFAULT_PERSIST_DIR,
        collection_name: str = "intent_cache",
        similarity_threshold: float = INTENT_CACHE_SIMILARITY_THRESHOLD,
    ):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self.similarity_threshold = similarity_threshold
        self.lock = threading.RLock()

        with self.lock:
            self._init_client()

    def _init_client(self):
        """Initialize ChromaDB client and collection."""
        self.client = get_shared_chroma_client(self.persist_directory)
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def cache_classification(
        self, email: Email, classification: EmailClassification
    ) -> None:
        """
        Store an email's classification result in the cache.
        Called after a successful LLM classification.
        """
        doc_text = f"Subject: {email.subject}\nBody: {email.body}"
        hash_hex = hashlib.sha256(doc_text.encode('utf-8')).hexdigest()[:16]
        doc_id = f"cache_{email.id}_{hash_hex}"

        metadata = {
            "email_id": email.id,
            "intent": classification.intent,
            "urgency": classification.urgency,
            "confidence": classification.confidence,
            "classification_explanation": classification.classification_explanation,
            "key_details": json.dumps(classification.key_details),
            "missing_information": json.dumps(classification.missing_information),
        }

        with self.lock:
            self.collection.upsert(
                documents=[doc_text],
                metadatas=[metadata],
                ids=[doc_id],
            )
        logger.info(
            f"[CACHE] Stored classification for email '{email.subject}' "
            f"→ intent={classification.intent} (confidence={classification.confidence:.2f})"
        )

    def get_cached_classification(
        self, email: Email, similarity_threshold: Optional[float] = None
    ) -> Optional[FastPathResult]:
        """
        Look up the cache for a near-duplicate email.

        Returns FastPathResult with outcome="cache_hit" if a match is found
        above the similarity threshold. Returns None otherwise.
        """
        threshold = similarity_threshold or self.similarity_threshold
        doc_text = f"Subject: {email.subject}\nBody: {email.body}"

        with self.lock:
            total_count = self.collection.count()
            if total_count == 0:
                return None

            try:
                result = self.collection.query(
                    query_texts=[doc_text],
                    n_results=1,
                )
            except Exception as e:
                logger.error(f"[CACHE] Query error: {e}")
                return None

        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        if not metadatas or not distances:
            return None

        meta = metadatas[0]
        raw_distance = distances[0]
        similarity = max(0.0, min(1.0, 1.0 - raw_distance))

        if similarity >= threshold:
            try:
                key_details = json.loads(meta.get("key_details", "[]"))
            except json.JSONDecodeError:
                val = meta.get("key_details", "")
                key_details = val.split("|") if val else []
                
            try:
                missing_info = json.loads(meta.get("missing_information", "[]"))
            except json.JSONDecodeError:
                val = meta.get("missing_information", "")
                missing_info = val.split("|") if val else []

            classification = EmailClassification(
                intent=meta["intent"],
                urgency=int(meta["urgency"]),
                confidence=float(meta["confidence"]),
                classification_explanation=meta.get("classification_explanation", "Cached classification"),
                key_details=key_details,
                missing_information=missing_info,
            )

            logger.info(
                f"[CACHE HIT] Email '{email.subject}' matched cached intent "
                f"'{classification.intent}' (similarity={similarity:.3f} >= {threshold})"
            )

            return FastPathResult(
                outcome="cache_hit",
                confidence=similarity,
                reason=f"Semantic cache hit (similarity={similarity:.3f})",
                classification=classification,
            )

        logger.info(
            f"[CACHE MISS] Email '{email.subject}' — best similarity {similarity:.3f} < {threshold}"
        )
        return None

    def invalidate_for_intent(self, intent: str) -> int:
        """
        Remove all cached entries for a given intent category.
        Called when a human correction overrides an intent classification.
        Returns the number of entries removed.
        """
        with self.lock:
            try:
                # Query all entries matching this intent
                results = self.collection.get(
                    where={"intent": intent},
                    include=["metadatas"]
                )
                ids_to_delete = results.get("ids", [])
                if ids_to_delete:
                    self.collection.delete(ids=ids_to_delete)
                    logger.info(
                        f"[CACHE INVALIDATED] Removed {len(ids_to_delete)} cached entries for intent '{intent}'"
                    )
                return len(ids_to_delete)
            except Exception as e:
                logger.error(f"[CACHE] Invalidation error for intent '{intent}': {e}")
                return 0

    def clear(self) -> None:
        """Clear all cached entries (for testing/reset)."""
        with self.lock:
            try:
                self.client.delete_collection(self.collection_name)
            except Exception as e:
                logger.warning(f"[CACHE] Could not delete collection '{self.collection_name}': {e}")
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )


# Global singleton
intent_cache = IntentCache()
