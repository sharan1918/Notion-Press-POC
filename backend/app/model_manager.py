import os
import threading
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

SUPPORTED_MODELS: List[Dict[str, Any]] = [
    {
        "id": "google/gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "provider": "Google",
        "tier": "Fast & Cost-Effective",
        "badge": "Recommended",
        "input_cost_per_m": "$0.075",
        "output_cost_per_m": "$0.30",
        "latency_badge": "< 700ms",
        "description": "Sub-second inference and 100% structured JSON compliance at 1/30th the cost of flagship models. Best overall Pareto-optimal model for author support triage.",
        "is_recommended": True,
    },
    {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "provider": "OpenAI",
        "tier": "Flagship Reasoning",
        "badge": "Frontier",
        "input_cost_per_m": "$2.50",
        "output_cost_per_m": "$10.00",
        "latency_badge": "~ 2,500ms",
        "description": "Frontier multimodal reasoning engine. Deep contextual nuance, but 33x higher cost and 3.6x higher latency for email triage tasks.",
        "is_recommended": False,
    },
    {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "provider": "OpenAI",
        "tier": "Lightweight High-Speed",
        "badge": "Economical",
        "input_cost_per_m": "$0.15",
        "output_cost_per_m": "$0.60",
        "latency_badge": "< 800ms",
        "description": "Fast and lightweight OpenAI model. Good general classification capability with moderate cost.",
        "is_recommended": False,
    },
    {
        "id": "meta-llama/llama-3.3-70b-instruct",
        "name": "Llama 3.3 70B",
        "provider": "Meta",
        "tier": "Open-Weights Enterprise",
        "badge": "Open-Source",
        "input_cost_per_m": "$0.35",
        "output_cost_per_m": "$0.40",
        "latency_badge": "~ 1,200ms",
        "description": "Leading open-weights instruction model. Ideal for air-gapped on-premise enterprise deployments without vendor lock-in.",
        "is_recommended": False,
    },
]

MODEL_MAP: Dict[str, Dict[str, Any]] = {m["id"]: m for m in SUPPORTED_MODELS}

DEFAULT_MODEL_ID = "google/gemini-2.5-flash"

_lock = threading.Lock()
# Initialize from environment variable if valid, otherwise fallback to recommended default
_env_model = os.getenv("OPENROUTER_PRIMARY_MODEL", "").strip()
_active_model_id = _env_model if _env_model in MODEL_MAP else DEFAULT_MODEL_ID


def get_supported_models() -> List[Dict[str, Any]]:
    """Return all 4 supported models with active flag populated."""
    with _lock:
        current_id = _active_model_id
    return [{**m, "is_active": m["id"] == current_id} for m in SUPPORTED_MODELS]


def get_active_model() -> Dict[str, Any]:
    """Return the currently selected active model dict."""
    with _lock:
        current_id = _active_model_id
    model_info = MODEL_MAP.get(current_id, MODEL_MAP[DEFAULT_MODEL_ID])
    return {**model_info, "is_active": True}


def get_active_model_id() -> str:
    """Return the currently active model string identifier."""
    with _lock:
        return _active_model_id


def set_active_model(model_id: str) -> Dict[str, Any]:
    """
    Switch the primary model at runtime.
    Validates model ID and resets graph LLM cache.
    """
    global _active_model_id
    if model_id not in MODEL_MAP:
        valid_ids = list(MODEL_MAP.keys())
        raise ValueError(f"Invalid model '{model_id}'. Supported models: {valid_ids}")

    with _lock:
        _active_model_id = model_id

    # Invalidate cached LLM instances in graph module if loaded
    try:
        from app import graph
        if hasattr(graph, "reset_llm_cache"):
            graph.reset_llm_cache()
    except Exception as e:
        logger.warning(f"Could not reset graph LLM cache: {e}")

    logger.info(f"[ModelManager] Primary model switched to: {model_id} ({MODEL_MAP[model_id]['name']})")
    return get_active_model()


def get_ordered_model_ids() -> List[str]:
    """
    Return list of model IDs with the active model first,
    followed by the other supported models as automated fallbacks.
    Respects explicit test/environment overrides if all 4 are provided.
    """
    env_primary = os.getenv("OPENROUTER_PRIMARY_MODEL")
    env_secondary = os.getenv("OPENROUTER_SECONDARY_MODEL")
    env_tertiary = os.getenv("OPENROUTER_TERTIARY_MODEL")
    env_quaternary = os.getenv("OPENROUTER_QUATERNARY_MODEL")

    if env_primary and env_secondary and env_tertiary and env_quaternary:
        return [env_primary, env_secondary, env_tertiary, env_quaternary]

    with _lock:
        current_id = _active_model_id

    ordered = [current_id]
    for m in SUPPORTED_MODELS:
        if m["id"] != current_id:
            ordered.append(m["id"])
    return ordered
