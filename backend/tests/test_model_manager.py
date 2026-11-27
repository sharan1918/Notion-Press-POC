import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.model_manager import (
    get_supported_models,
    get_active_model,
    set_active_model,
    get_active_model_id,
    get_ordered_model_ids,
    SUPPORTED_MODELS
)
from app.config import API_AUTH_KEY

client = TestClient(app)

def test_model_manager_registry_has_four_models():
    models = get_supported_models()
    assert len(models) == 4
    ids = [m["id"] for m in models]
    assert "google/gemini-2.5-flash" in ids
    assert "openai/gpt-4o" in ids
    assert "openai/gpt-4o-mini" in ids
    assert "meta-llama/llama-3.3-70b-instruct" in ids

def test_model_manager_switch_active_model():
    initial = get_active_model_id()
    # Switch to gpt-4o
    updated = set_active_model("openai/gpt-4o")
    assert updated["id"] == "openai/gpt-4o"
    assert get_active_model_id() == "openai/gpt-4o"
    
    # Active model should be first in ordered list
    ordered = get_ordered_model_ids()
    assert ordered[0] == "openai/gpt-4o"
    assert len(ordered) == 4
    
    # Switch back to gemini-2.5-flash
    set_active_model("google/gemini-2.5-flash")
    assert get_active_model_id() == "google/gemini-2.5-flash"
    assert get_ordered_model_ids()[0] == "google/gemini-2.5-flash"

def test_model_manager_invalid_model_raises():
    with pytest.raises(ValueError, match="Invalid model"):
        set_active_model("nonexistent-model-xyz")

def test_api_get_models():
    res = client.get("/api/models")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    assert len(data["models"]) == 4
    assert "active_model_id" in data
    assert "active_model" in data
    assert data["active_model"]["name"]

def test_api_switch_model_endpoint():
    res = client.post(
        "/api/models/select",
        headers={"X-API-Key": API_AUTH_KEY},
        json={"model_id": "meta-llama/llama-3.3-70b-instruct"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["active_model"]["id"] == "meta-llama/llama-3.3-70b-instruct"

    # Verify invalid model rejected with 400
    bad_res = client.post(
        "/api/models/select",
        headers={"X-API-Key": API_AUTH_KEY},
        json={"model_id": "invalid-model-123"}
    )
    assert bad_res.status_code == 400

    # Reset back to recommended
    set_active_model("google/gemini-2.5-flash")

