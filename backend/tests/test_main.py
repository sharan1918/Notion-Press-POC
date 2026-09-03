import pytest
from fastapi.testclient import TestClient
from app.main import app, triage_jobs
import asyncio

client = TestClient(app)

@pytest.fixture(autouse=True)
def clear_jobs():
    triage_jobs.clear()
    yield
    triage_jobs.clear()

def test_triage_all_accepted():
    response = client.post("/api/triage-all", json={"email_ids": ["1", "2"]})
    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "accepted"

    job_id = data["job_id"]
    status_res = client.get(f"/api/triage-status/{job_id}")
    assert status_res.status_code == 200
    job_data = status_res.json()
    assert job_data["status"] in ["pending", "processing", "completed"]
    assert job_data["total"] == 2

def test_triage_all_too_many_emails():
    # Attempt to send 51 emails
    response = client.post("/api/triage-all", json={"email_ids": [str(i) for i in range(51)]})
    assert response.status_code == 400
    assert "Too many email IDs" in response.json()["detail"]

def test_triage_status_not_found():
    response = client.get("/api/triage-status/invalid_job_id")
    assert response.status_code == 404

def test_get_emails_includes_samples():
    response = client.get("/api/emails")
    assert response.status_code == 200
    emails = response.json()
    assert len(emails) >= 10
    ids = [e["id"] for e in emails]
    assert "1" in ids

def test_create_custom_email():
    payload = {
        "sender_name": "Test Author",
        "sender": "test.author@example.com",
        "subject": "Test Subject For Realtime Evaluation",
        "body": "Hello, I am testing the realtime evaluation flow."
    }
    response = client.post("/api/emails", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["id"].startswith("mail_")
    assert created["sender_name"] == "Test Author"
    assert created["sender"] == "test.author@example.com"
    assert created["subject"] == "Test Subject For Realtime Evaluation"
    assert "timestamp" in created

    # Verify it is returned at the top of get_emails
    get_res = client.get("/api/emails")
    assert get_res.status_code == 200
    all_emails = get_res.json()
    assert all_emails[0]["id"] == created["id"]

def test_create_custom_email_validation_failure():
    # Missing subject
    response = client.post("/api/emails", json={
        "sender_name": "Test Author",
        "sender": "test@example.com",
        "subject": "   ",
        "body": "Some body"
    })
    assert response.status_code == 400
    assert "Subject is required" in response.json()["detail"]
