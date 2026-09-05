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
    global _CLIENTS, _EMBEDDING_FUNCTION
    with _CLIENT_LOCK:
        _CLIENTS.clear()
        _EMBEDDING_FUNCTION = None


class ResilientEmbeddingFunction(chromadb.EmbeddingFunction[chromadb.api.types.Documents]):
    """
    Resilient Hybrid Embedding Function:
    - Primary: Google Gemini Cloud Embedding (`models/gemini-embedding-001`, dimension=384 via MRL).
      High throughput (1,500 RPM, $0 cost) and offloads neural net compute to Google Cloud GPUs.
    - Fallback: Local ONNX `DefaultEmbeddingFunction` (`all-MiniLM-L6-v2`, dimension=384).
      Takes over automatically if Google API key is absent, offline, or experiencing errors.
    """

    def __init__(self, api_key_env_var: str = "GOOGLE_API_KEY", dimension: int = 384):
        self.dimension = dimension
        self.api_key_env_var = api_key_env_var
        self._gemini_ef = None
        self._onnx_ef = None
        self._lock = threading.Lock()

        api_key = os.getenv(api_key_env_var)
        if api_key and len(api_key) > 10 and not api_key.startswith("your_") and not api_key.startswith("dummy_"):
            try:
                from chromadb.utils.embedding_functions import GoogleGeminiEmbeddingFunction
                self._gemini_ef = GoogleGeminiEmbeddingFunction(
                    model_name="models/gemini-embedding-001",
                    dimension=dimension,
                    api_key_env_var=api_key_env_var,
                )
                logger.info(f"[Chroma] Initialized primary Google Gemini embedding function (dimension={dimension})")
            except Exception as e:
                logger.warning(f"[Chroma] Failed to initialize Google Gemini embedding: {e}. Will use ONNX fallback.")

    def __call__(self, input: chromadb.api.types.Documents) -> chromadb.api.types.Embeddings:
        if self._gemini_ef is not None:
            try:
                return self._gemini_ef(input)
            except Exception as e:
                logger.warning(f"[Chroma] Google Gemini embedding call failed ({e}). Falling back to local ONNX.")

        with self._lock:
            if self._onnx_ef is None:
                from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
                logger.info("[Chroma] Initializing fallback local ONNX DefaultEmbeddingFunction")
                self._onnx_ef = DefaultEmbeddingFunction()
        return self._onnx_ef(input)

    @staticmethod
    def name() -> str:
        return "resilient_embedding_function"

    def get_config(self) -> dict:
        return {"dimension": self.dimension, "api_key_env_var": self.api_key_env_var}

    @staticmethod
    def build_from_config(config: dict) -> "ResilientEmbeddingFunction":
        return ResilientEmbeddingFunction(**config)


_EMBEDDING_FUNCTION = None

def get_shared_embedding_function() -> chromadb.EmbeddingFunction:
    """Return the shared resilient embedding function singleton."""
    global _EMBEDDING_FUNCTION
    with _CLIENT_LOCK:
        if _EMBEDDING_FUNCTION is None:
            _EMBEDDING_FUNCTION = ResilientEmbeddingFunction()
        return _EMBEDDING_FUNCTION


def get_or_create_resilient_collection(
    client: chromadb.ClientAPI,
    name: str,
    metadata: dict | None = None,
    embedding_function: chromadb.EmbeddingFunction | None = None
) -> chromadb.Collection:
    """
    Get or create a ChromaDB collection, automatically healing any existing
    embedding function metadata conflicts without crashing.
    """
    ef = embedding_function or get_shared_embedding_function()
    try:
        return client.get_or_create_collection(
            name=name,
            metadata=metadata,
            embedding_function=ef,
        )
    except ValueError as e:
        if "Embedding function conflict" in str(e):
            logger.warning(f"[Chroma] Embedding function conflict on '{name}'. Recreating collection with resilient function.")
            try:
                client.delete_collection(name)
            except Exception:
                pass
            return client.get_or_create_collection(
                name=name,
                metadata=metadata,
                embedding_function=ef,
            )
        raise
