from fastapi.testclient import TestClient
from app.main import app, serialize_state
from app.policy import determine_action, evaluate_guardrails
from app.models import EmailClassification, RecommendedAction

client = TestClient(app)

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
    serialized = serialize_state({"classification": cls, "log": ["test"]})
    assert isinstance(serialized["classification"], dict)
    assert serialized["classification"]["intent"] == "general_inquiry"

