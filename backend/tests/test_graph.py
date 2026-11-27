from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from langgraph.graph import END

from app.main import app, serialize_state
from app.policy import determine_action, evaluate_guardrails
from app.models import Email, EmailClassification
from app.graph import (
    get_llms,
    invoke_classification,
    fetch_and_classify,
    route_after_classify,
)
from app.config import MAX_LLM_RETRIES, API_AUTH_KEY

client = TestClient(app, headers={"X-API-Key": API_AUTH_KEY})

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_get_emails():
    response = client.get("/api/emails")
    assert response.status_code == 200
    emails = response.json()
    assert len(emails) >= 9
    assert emails[0]["id"] == "1"

def test_policy_high_impact_guardrail():
    cls = EmailClassification(
        intent="royalty_payment",
        urgency=5,
        key_details=["Payout delay"],
        missing_information=[],
        confidence=0.95,
        classification_explanation="Author asks for urgent royalty payout"
    )
    action = determine_action(cls)
    guardrail = evaluate_guardrails(cls, action)
    assert guardrail.approval_required is True

def test_serialize_state():
    cls = EmailClassification(
        intent="general_inquiry",
        urgency=1,
        key_details=["General inquiry"],
        missing_information=[],
        confidence=0.9,
        classification_explanation="General author question"
    )
    state = {
        "classification": cls,
        "log": ["test"],
        "tags": {"tag1", "tag2"},
        "nested": {"items": [{"a": 1}], "status_set": {"done"}},
        "custom_obj": object()
    }
    serialized = serialize_state(state)
    assert isinstance(serialized["classification"], dict)
    assert serialized["classification"]["intent"] == "general_inquiry"
    assert isinstance(serialized["tags"], list)
    assert set(serialized["tags"]) == {"tag1", "tag2"}
    assert isinstance(serialized["nested"]["status_set"], list)
    assert serialized["nested"]["status_set"] == ["done"]
    assert "custom_obj" not in serialized  # Non-serializable object safely omitted

def test_get_llms_initialization(monkeypatch):
    """Verify OpenRouter clients are configured without contacting the API."""
    import app.graph as graph_module

    monkeypatch.setattr(graph_module, "_CACHED_LLMS", None)
    monkeypatch.setattr(graph_module, "_CACHED_KEYS", None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key-12345")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.example/v1")
    monkeypatch.setenv("OPENROUTER_PRIMARY_MODEL", "provider/primary-test")
    monkeypatch.setenv("OPENROUTER_SECONDARY_MODEL", "provider/secondary-test")
    monkeypatch.setenv("OPENROUTER_TERTIARY_MODEL", "provider/tertiary-test")
    monkeypatch.setenv("OPENROUTER_QUATERNARY_MODEL", "provider/quaternary-test")

    with patch("app.graph.ChatOpenAI") as mock_chat_openai:
        clients = get_llms()

    assert all(client is not None for client in clients)
    assert mock_chat_openai.call_count == 4
    assert [call.kwargs["model"] for call in mock_chat_openai.call_args_list] == [
        "provider/primary-test",
        "provider/secondary-test",
        "provider/tertiary-test",
        "provider/quaternary-test",
    ]
    for call in mock_chat_openai.call_args_list:
        assert call.kwargs["api_key"] == "test-openrouter-key-12345"
        assert call.kwargs["base_url"] == "https://openrouter.example/v1"

def test_invoke_classification_gemini_success():
    expected_cls = EmailClassification(
        intent="publishing_status",
        urgency=3,
        key_details=["Book status inquiry"],
        missing_information=[],
        confidence=0.98,
        classification_explanation="Author asks for publication status"
    )
    
    mock_groq = MagicMock()
    mock_groq.with_structured_output.return_value.with_fallbacks.return_value.invoke.return_value = expected_cls
    
    with patch("app.graph.get_llms", return_value=(None, mock_groq, None)):
        state = {}
        res, provider = invoke_classification("test prompt", state)
        assert res.intent == "publishing_status"
        assert provider == "OpenRouter model fallback chain"

def test_invoke_classification_failover_to_gemini():
    expected_cls = EmailClassification(
        intent="cover_design",
        urgency=4,
        key_details=["Cover art proof"],
        missing_information=[],
        confidence=0.92,
        classification_explanation="Author asking about book cover proof"
    )
    
    mock_groq = MagicMock()
    mock_groq.with_structured_output.return_value.with_fallbacks.return_value.invoke.return_value = expected_cls
    
    mock_gemini = MagicMock()
    
    with patch("app.graph.get_llms", return_value=(mock_groq, mock_gemini, None)):
        state = {}
        res, provider = invoke_classification("test prompt", state)
        assert res.intent == "cover_design"
        assert provider == "OpenRouter model fallback chain"

def test_invoke_classification_failover_to_tertiary():
    expected_cls = EmailClassification(
        intent="cover_design",
        urgency=4,
        key_details=["Cover art proof"],
        missing_information=[],
        confidence=0.92,
        classification_explanation="Author asking about book cover proof"
    )
    
    mock_groq = MagicMock()
    mock_groq.with_structured_output.return_value.with_fallbacks.return_value.invoke.return_value = expected_cls
    
    mock_gemini = MagicMock()
    
    mock_tertiary = MagicMock()
    
    with patch("app.graph.get_llms", return_value=(mock_groq, mock_gemini, mock_tertiary)):
        state = {}
        res, provider = invoke_classification("test prompt", state)
        assert res.intent == "cover_design"
        assert provider == "OpenRouter model fallback chain"

def test_invoke_classification_no_provider_raises():
    with patch("app.graph.get_llms", return_value=(None, None, None)):
        with pytest.raises(RuntimeError, match="No working LLM provider found"):
            invoke_classification("test prompt", {})

def test_fetch_and_classify_retry_limit():
    email = Email(
        id="test_1",
        sender="test@example.com",
        sender_name="Test Author",
        subject="Query",
        body="Body",
        timestamp="2026-09-02T00:00:00"
    )
    state = {
        "email": email,
        "retry_count": MAX_LLM_RETRIES,  # Already at max retries
        "processing_log": [],
        "final_status": "processing"
    }
    
    with patch("app.graph.invoke_classification", side_effect=Exception("LLM down")):
        updated_state = fetch_and_classify(state)
        assert updated_state["final_status"] == "error"
        assert updated_state["retry_count"] == 0
        assert route_after_classify(updated_state) == END

def test_route_after_classify():
    state_retry = {"final_status": "processing", "retry_count": 1}
    assert route_after_classify(state_retry) == "fetch_and_classify"
    
    state_ok = {"final_status": "processing", "retry_count": 0}
    assert route_after_classify(state_ok) == "determine_action"
    
    state_err = {"final_status": "error", "retry_count": 0}
    assert route_after_classify(state_err) == END
