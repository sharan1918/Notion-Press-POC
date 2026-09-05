import json
import os
import threading
import logging
from typing import Optional
from app.chroma_client import get_shared_chroma_client, get_or_create_resilient_collection
from app.models import HumanCorrection

logger = logging.getLogger(__name__)

# Default similarity threshold: 0.45 cosine similarity (distance <= 0.55)
DEFAULT_SIMILARITY_THRESHOLD = float(os.environ.get("CORRECTION_SIMILARITY_THRESHOLD", "0.45"))
DEFAULT_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")
DEFAULT_JSON_PATH = os.environ.get("CORRECTIONS_JSON_PATH", "data/corrections.json")

class FeedbackStore:
    """
    Persistent ChromaDB vector store for RAG retrieval of human corrections.
    Features:
    - Explicit cosine distance metric ('hnsw:space': 'cosine')
    - Configurable similarity threshold filtering (cosine similarity = 1.0 - distance)
    - Concurrency-safe access via RLock
    - Dual persistence (ChromaDB vectors + human-readable JSON backup)
    - Cloud deployment compatibility (HttpClient fallback if CHROMA_HOST is set)
    """

    def __init__(
        self,
        persist_directory: str = DEFAULT_PERSIST_DIR,
        json_path: str = DEFAULT_JSON_PATH,
        collection_name: str = "human_corrections",
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD
    ):
        self.persist_directory = persist_directory
        self.json_path = json_path
        self.collection_name = collection_name
        self.similarity_threshold = similarity_threshold
        self.lock = threading.RLock()
        self._corrections_cache: list[HumanCorrection] = []

        with self.lock:
            self._init_chroma_client()
            self._hydrate_from_json()

    def _init_chroma_client(self):
        """Initialize local persistent ChromaDB or remote managed Cloud HTTP client."""
        self.client = get_shared_chroma_client(self.persist_directory)

        # Explicit Cosine Metric with Resilient Hybrid Embedding
        self.collection = get_or_create_resilient_collection(
            self.client,
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )

    def _hydrate_from_json(self):
        """Sync from JSON backup if collection is empty, or load JSON into memory."""
        if os.path.exists(self.json_path):
            try:
                with open(self.json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._corrections_cache = [HumanCorrection(**item) for item in data]
            except Exception as e:
                logger.warning(f"Failed to read corrections JSON backup: {e}")
                self._corrections_cache = []
        else:
            self._corrections_cache = []

        # If ChromaDB collection count is 0 but we have JSON items, index them
        try:
            if self.collection.count() == 0 and self._corrections_cache:
                for c in self._corrections_cache:
                    self._index_correction_in_chroma(c)
        except Exception as e:
            logger.warning(f"Failed to check/backfill ChromaDB count: {e}")

    def _index_correction_in_chroma(self, correction: HumanCorrection) -> None:
        """Internal helper to insert/upsert correction vector into ChromaDB."""
        doc_id = f"corr_{correction.timestamp}_{abs(hash(correction.email_subject + correction.timestamp))}"
        doc_text = f"Subject: {correction.email_subject}\nBody: {correction.email_body}"
        
        metadata = {
            "email_subject": correction.email_subject,
            "email_body": correction.email_body,
            "original_intent": correction.original_intent,
            "corrected_intent": correction.corrected_intent,
            "notes": correction.notes,
            "timestamp": correction.timestamp
        }

        self.collection.upsert(
            documents=[doc_text],
            metadatas=[metadata],
            ids=[doc_id]
        )

    def save_correction(self, correction: HumanCorrection) -> None:
        """Concurrency-safe save to both ChromaDB vector store and JSON backup."""
        with self.lock:
            # 1. Index in ChromaDB
            self._index_correction_in_chroma(correction)

            # 2. Update memory cache and JSON
            self._corrections_cache.append(correction)
            os.makedirs(os.path.dirname(self.json_path) or ".", exist_ok=True)
            with open(self.json_path, "w", encoding="utf-8") as f:
                json.dump([c.model_dump() for c in self._corrections_cache], f, indent=2)
            logger.info(
                f"[RAG] Saved human correction: '{correction.email_subject}' "
                f"({correction.original_intent} -> {correction.corrected_intent})"
            )

    def get_all_corrections(self) -> list[HumanCorrection]:
        """Return all stored corrections."""
        with self.lock:
            return list(self._corrections_cache)

    def get_relevant_corrections(
        self,
        query_text: Optional[str] = None,
        predicted_intent: Optional[str] = None,
        n_results: int = 3,
        similarity_threshold: Optional[float] = None
    ) -> list[HumanCorrection]:
        """
        RAG Semantic Retrieval:
        1. If query_text is provided, perform vector similarity search in ChromaDB.
        2. Calculate cosine similarity = 1.0 - distance.
        3. Filter results by similarity_threshold (rejecting irrelevant queries).
        4. Fall back to category-relevant corrections if semantic search produces no match above threshold.
        """
        threshold = similarity_threshold if similarity_threshold is not None else self.similarity_threshold

        with self.lock:
            results: list[HumanCorrection] = []
            seen_keys = set()
            total_count = self.collection.count()
            logger.info(
                f"[RAG] Querying vector store | Total stored: {total_count} | Threshold: {threshold:.2f}"
            )

            if query_text and total_count > 0:
                try:
                    query_res = self.collection.query(
                        query_texts=[query_text],
                        n_results=min(n_results, total_count)
                    )

                    metadatas = query_res.get("metadatas", [[]])[0]
                    distances = query_res.get("distances", [[]])[0]

                    for meta, dist in zip(metadatas, distances):
                        # With cosine space: distance = 1 - cosine_similarity
                        similarity = 1.0 - dist
                        subj = meta.get("email_subject", "Unknown")
                        if similarity >= threshold:
                            logger.info(
                                f"[RAG Match] Similarity: {similarity:.3f} >= {threshold:.2f} | "
                                f"Subject: '{subj}' -> {meta.get('corrected_intent')}"
                            )
                            c = HumanCorrection(**meta)
                            key = f"{c.email_subject}_{c.timestamp}"
                            if key not in seen_keys:
                                seen_keys.add(key)
                                results.append(c)
                        else:
                            logger.info(
                                f"[RAG Filtered] Similarity: {similarity:.3f} < {threshold:.2f} | "
                                f"Subject: '{subj}'"
                            )
                except Exception as e:
                    logger.error(f"Error querying ChromaDB: {e}")

            # If semantic search produced results, return them
            if results:
                logger.info(f"[RAG] Semantic search returned {len(results)} relevant correction(s)")
                return results

            # Fallback to category / recent if no query_text provided or semantic match is empty
            if not query_text and predicted_intent:
                category_matches = [
                    c for c in self._corrections_cache
                    if c.corrected_intent == predicted_intent or c.original_intent == predicted_intent
                ][:n_results]
                logger.info(f"[RAG Fallback] Category fallback matched {len(category_matches)} correction(s)")
                return category_matches

            logger.info("[RAG] No matching historical corrections above threshold")
            return results

    def format_for_prompt(self, corrections: list[HumanCorrection]) -> str:
        """Format retrieved corrections as few-shot guidance for prompt injection."""
        if not corrections:
            return ""
        
        text = ""
        for c in corrections:
            text += f'- An email about "{c.email_subject}" was initially classified as "{c.original_intent}"\n'
            text += f'  but a human corrected it to "{c.corrected_intent}".\n'
            text += f'  Reason / Correction Notes: "{c.notes}"\n\n'
        return text

    def clear(self) -> None:
        """Clear all stored vectors and cache (for testing/reset)."""
        with self.lock:
            try:
                self.client.delete_collection(self.collection_name)
            except Exception:
                pass
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            self._corrections_cache = []
            if os.path.exists(self.json_path):
                try:
                    os.remove(self.json_path)
                except Exception:
                    pass

# Global singleton
feedback_store = FeedbackStore()
