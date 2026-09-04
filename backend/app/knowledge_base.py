import os
import logging
import threading
from datetime import datetime
from typing import Optional
import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

DEFAULT_PERSIST_DIR = "data/chromadb"
DEFAULT_COLLECTION_NAME = "author_knowledge_base"


class AuthorKnowledgeBase:
    """
    Persistent ChromaDB vector store for Notion Press operational policies and author FAQs.
    Allows dynamic PDF/document ingestion, deletion, and semantic RAG retrieval without hardcoded seed data.
    """

    def __init__(
        self,
        persist_directory: str = DEFAULT_PERSIST_DIR,
        collection_name: str = DEFAULT_COLLECTION_NAME,
    ):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self.lock = threading.RLock()
        self.client = None
        self.collection = None
        # Fallback in-memory storage when ChromaDB is unavailable
        self._in_memory_docs: list[dict] = []
        # In-memory document registry for quick metadata lookups
        self._doc_registry: dict[str, dict] = {}

        with self.lock:
            self._init_chroma_client()
            self._sync_registry_from_chroma()

    def _init_chroma_client(self):
        """Initialize ChromaDB client."""
        chroma_host = os.environ.get("CHROMA_HOST")
        chroma_port = int(os.environ.get("CHROMA_PORT", "8000"))
        chroma_ssl = os.environ.get("CHROMA_SSL", "false").lower() == "true"

        try:
            if chroma_host:
                logger.info(f"[KB] Connecting to remote ChromaDB at {chroma_host}:{chroma_port}")
                self.client = chromadb.HttpClient(
                    host=chroma_host,
                    port=chroma_port,
                    ssl=chroma_ssl,
                    settings=Settings(anonymized_telemetry=False),
                )
            else:
                os.makedirs(self.persist_directory, exist_ok=True)
                self.client = chromadb.PersistentClient(
                    path=self.persist_directory,
                    settings=Settings(anonymized_telemetry=False),
                )

            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
            logger.info(f"[KB] Initialized ChromaDB collection '{self.collection_name}' successfully")
        except Exception as e:
            logger.warning(f"[KB] ChromaDB initialization failed: {e}. Operating in in-memory fallback mode.")
            self.client = None
            self.collection = None

    def _sync_registry_from_chroma(self):
        """Reconstruct document registry from existing ChromaDB chunks on startup."""
        if not self.collection:
            return

        try:
            count = self.collection.count()
            if count == 0:
                return

            # Fetch all metadata
            all_data = self.collection.get(include=["metadatas"])
            metadatas = all_data.get("metadatas", [])
            for meta in metadatas:
                if not meta:
                    continue
                filename = meta.get("filename", "unknown_document")
                uploaded_at = meta.get("uploaded_at", datetime.now().isoformat())
                if filename not in self._doc_registry:
                    self._doc_registry[filename] = {
                        "filename": filename,
                        "chunk_count": 0,
                        "uploaded_at": uploaded_at,
                    }
                self._doc_registry[filename]["chunk_count"] += 1
            logger.info(f"[KB] Loaded {len(self._doc_registry)} existing documents ({count} chunks) from ChromaDB")
        except Exception as e:
            logger.warning(f"[KB] Failed to sync registry from ChromaDB: {e}")

    def add_document_chunks(self, filename: str, chunks: list[dict]) -> int:
        """
        Ingest parsed document chunks into the knowledge base.
        Replaces any existing chunks for the same filename.
        """
        if not chunks:
            return 0

        with self.lock:
            # If document already exists, remove older chunks first
            self.delete_document(filename)

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ids = [chunk["id"] for chunk in chunks]
            documents = [chunk["content"] for chunk in chunks]
            metadatas = [
                {
                    "filename": filename,
                    "title": chunk.get("title", f"{filename} (Section {i+1})"),
                    "intent": chunk.get("intent", "general_inquiry"),
                    "chunk_index": chunk.get("chunk_index", i + 1),
                    "uploaded_at": now_str,
                }
                for i, chunk in enumerate(chunks)
            ]

            if self.collection:
                try:
                    self.collection.add(
                        ids=ids,
                        documents=documents,
                        metadatas=metadatas,
                    )
                except Exception as e:
                    logger.error(f"[KB] ChromaDB add error: {e}")

            # Keep in-memory copy synced
            for chunk, meta in zip(chunks, metadatas):
                self._in_memory_docs.append({
                    "id": chunk["id"],
                    "filename": filename,
                    "title": meta["title"],
                    "intent": meta["intent"],
                    "content": chunk["content"],
                    "uploaded_at": now_str,
                })

            self._doc_registry[filename] = {
                "filename": filename,
                "chunk_count": len(chunks),
                "uploaded_at": now_str,
            }

            logger.info(f"[KB] Ingested {len(chunks)} chunks for '{filename}'")
            return len(chunks)

    def delete_document(self, filename: str) -> int:
        """Remove all chunks associated with a specific document filename."""
        with self.lock:
            deleted_count = 0
            if self.collection:
                try:
                    existing = self.collection.get(where={"filename": filename})
                    ids_to_delete = existing.get("ids", [])
                    if ids_to_delete:
                        self.collection.delete(ids=ids_to_delete)
                        deleted_count = len(ids_to_delete)
                except Exception as e:
                    logger.warning(f"[KB] ChromaDB delete error for {filename}: {e}")

            # Remove from in-memory
            before_len = len(self._in_memory_docs)
            self._in_memory_docs = [d for d in self._in_memory_docs if d.get("filename") != filename]
            deleted_count = max(deleted_count, before_len - len(self._in_memory_docs))

            self._doc_registry.pop(filename, None)
            logger.info(f"[KB] Deleted document '{filename}' ({deleted_count} chunks removed)")
            return deleted_count

    def clear_all(self) -> int:
        """Wipe all documents and chunks from the knowledge base."""
        with self.lock:
            total_chunks = 0
            if self.collection:
                try:
                    total_chunks = self.collection.count()
                    # Recreate empty collection
                    if self.client:
                        self.client.delete_collection(self.collection_name)
                        self.collection = self.client.get_or_create_collection(
                            name=self.collection_name,
                            metadata={"hnsw:space": "cosine"},
                        )
                except Exception as e:
                    logger.warning(f"[KB] Failed to reset ChromaDB collection: {e}")

            total_chunks = max(total_chunks, len(self._in_memory_docs))
            self._in_memory_docs = []
            self._doc_registry = {}
            logger.info(f"[KB] Cleared knowledge base completely ({total_chunks} chunks deleted)")
            return total_chunks

    def list_documents(self) -> list[dict]:
        """Return a list of all indexed documents and their chunk counts."""
        with self.lock:
            return list(self._doc_registry.values())

    def get_status(self) -> dict:
        """Get high-level summary of knowledge base health and contents."""
        with self.lock:
            chroma_chunk_count = 0
            if self.collection:
                try:
                    chroma_chunk_count = self.collection.count()
                except Exception:
                    chroma_chunk_count = 0

            return {
                "total_documents": len(self._doc_registry),
                "total_chunks": chroma_chunk_count if self.collection else len(self._in_memory_docs),
                "documents": list(self._doc_registry.values()),
                "chroma_connected": self.collection is not None,
            }

    def get_all_chunks(self, filename: Optional[str] = None) -> list[dict]:
        """Fetch all indexed chunks, optionally filtered by filename."""
        with self.lock:
            if self.collection:
                try:
                    kwargs = {"include": ["documents", "metadatas"]}
                    if filename:
                        kwargs["where"] = {"filename": filename}
                    res = self.collection.get(**kwargs)
                    ids = res.get("ids", [])
                    docs = res.get("documents", [])
                    metas = res.get("metadatas", [])
                    return [
                        {
                            "id": cid,
                            "content": doc,
                            "title": meta.get("title", "Policy Section"),
                            "filename": meta.get("filename", "document"),
                            "intent": meta.get("intent", "general_inquiry"),
                        }
                        for cid, doc, meta in zip(ids, docs, metas)
                    ]
                except Exception as e:
                    logger.warning(f"[KB] Error getting chunks from ChromaDB: {e}")

            # Fallback
            docs = self._in_memory_docs
            if filename:
                docs = [d for d in docs if d.get("filename") == filename]
            return docs

    def query_knowledge(
        self,
        query_text: str,
        intent: Optional[str] = None,
        top_k: int = 2,
    ) -> list[dict]:
        """
        Query the knowledge base for relevant policy chunks.
        Optionally filters by intent (general_inquiry, publishing_status, distribution).
        Falls back to in-memory search or returns empty list if no docs are indexed.
        """
        with self.lock:
            # Check if KB is empty
            if self.collection:
                try:
                    if self.collection.count() == 0:
                        return []
                except Exception:
                    pass
            elif not self._in_memory_docs:
                return []

            # 1. Attempt ChromaDB Query
            if self.collection:
                try:
                    # Try intent-filtered query first if provided
                    query_kwargs = {
                        "query_texts": [query_text],
                        "n_results": min(top_k, self.collection.count()),
                    }
                    if intent:
                        query_kwargs["where"] = {"intent": intent}

                    results = self.collection.query(**query_kwargs)

                    documents = results.get("documents", [[]])[0]
                    metadatas = results.get("metadatas", [[]])[0]
                    distances = results.get("distances", [[]])[0]

                    # If filtered query yielded no results, retry without filter
                    if not documents and intent:
                        query_kwargs.pop("where", None)
                        results = self.collection.query(**query_kwargs)
                        documents = results.get("documents", [[]])[0]
                        metadatas = results.get("metadatas", [[]])[0]
                        distances = results.get("distances", [[]])[0]

                    if documents:
                        retrieved = []
                        for doc, meta, dist in zip(documents, metadatas, distances):
                            retrieved.append({
                                "title": meta.get("title", "Notion Press Guide"),
                                "intent": meta.get("intent", "general_inquiry"),
                                "filename": meta.get("filename", "Policy Document"),
                                "content": doc,
                                "similarity_score": round(1.0 - dist, 3) if dist is not None else 1.0,
                            })
                        return retrieved
                except Exception as e:
                    logger.warning(f"[KB] ChromaDB query error: {e}. Falling back to in-memory search.")

            # 2. In-Memory Fallback
            return self._in_memory_search(query_text, intent, top_k)

    def _in_memory_search(
        self,
        query_text: str,
        intent: Optional[str] = None,
        top_k: int = 2,
    ) -> list[dict]:
        """Simple keyword matching fallback for offline/test resilience."""
        if not self._in_memory_docs:
            return []

        query_lower = query_text.lower()
        candidates = self._in_memory_docs

        if intent:
            filtered = [d for d in candidates if d.get("intent") == intent]
            if filtered:
                candidates = filtered

        scored = []
        for doc in candidates:
            score = 0
            for word in query_lower.split():
                if len(word) <= 2:
                    continue
                if word in doc.get("title", "").lower():
                    score += 3
                if word in doc.get("content", "").lower():
                    score += 1
            if score > 0:
                scored.append((score, doc))

        # If no score match, return top candidates
        if not scored and candidates:
            top_docs = candidates[:top_k]
        else:
            scored.sort(key=lambda x: x[0], reverse=True)
            top_docs = [doc for _, doc in scored[:top_k]]

        return [
            {
                "title": d.get("title", "Policy Section"),
                "intent": d.get("intent", "general_inquiry"),
                "filename": d.get("filename", "Policy Document"),
                "content": d.get("content", ""),
                "similarity_score": 0.85,
            }
            for d in top_docs
        ]


# Singleton instance
author_knowledge_base = AuthorKnowledgeBase()
