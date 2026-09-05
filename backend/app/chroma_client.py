import os
import threading
import logging
import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

_CLIENTS: dict = {}
_CLIENT_LOCK = threading.Lock()
DEFAULT_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")

def get_shared_chroma_client(persist_directory: str = DEFAULT_PERSIST_DIR) -> chromadb.ClientAPI:
    """
    Singleton ChromaDB client factory to prevent duplicate ONNX runtimes and memory exhaustion.
    Shares a single PersistentClient across FeedbackStore, IntentCache, and KnowledgeBase when targeting
    the same persist directory, while maintaining isolation when different directories (such as in tests)
    are requested.
    """
    chroma_host = os.environ.get("CHROMA_HOST")
    try:
        chroma_port = int(os.environ.get("CHROMA_PORT", "8000"))
    except (ValueError, TypeError):
        chroma_port = 8000
    chroma_ssl = os.environ.get("CHROMA_SSL", "false").lower() == "true"

    norm_dir = os.path.abspath(persist_directory) if persist_directory else os.path.abspath(DEFAULT_PERSIST_DIR)
    cache_key = (norm_dir, chroma_host, chroma_port, chroma_ssl)

    with _CLIENT_LOCK:
        if cache_key in _CLIENTS:
            return _CLIENTS[cache_key]

        if chroma_host:
            logger.info(f"[Chroma] Connecting to shared remote ChromaDB at {chroma_host}:{chroma_port}")
            client = chromadb.HttpClient(
                host=chroma_host,
                port=chroma_port,
                ssl=chroma_ssl,
                settings=Settings(anonymized_telemetry=False)
            )
        else:
            os.makedirs(norm_dir, exist_ok=True)
            logger.info(f"[Chroma] Initializing shared PersistentClient at {norm_dir}")
            client = chromadb.PersistentClient(
                path=norm_dir,
                settings=Settings(anonymized_telemetry=False)
            )
        _CLIENTS[cache_key] = client
        return client

def reset_shared_chroma_client():
    """Reset the shared clients cache (used during test teardowns if needed)."""
    global _CLIENTS
    with _CLIENT_LOCK:
        _CLIENTS.clear()
