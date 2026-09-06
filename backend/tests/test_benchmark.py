import os
import json
import pytest
from pathlib import Path

from app.models import Email, EmailClassification
from app.policy import determine_action, evaluate_guardrails
from app.intake_filter import check_spam

DATASET_PATH = Path(__file__).resolve().parent.parent.parent / "scripts" / "benchmark_dataset.json"

@pytest.fixture
def benchmark_data():
    assert DATASET_PATH.exists(), f"Benchmark dataset missing at {DATASET_PATH}"
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def test_benchmark_dataset_integrity(benchmark_data):
    """Verify that benchmark dataset has 20 items and all mandatory evaluation schema fields."""
    assert len(benchmark_data) >= 20
    required_keys = {
        "id", "sender", "sender_name", "subject", "body",
        "expected_intent", "expected_urgency", "expected_action",
        "expected_approval_required", "expected_missing_info"
    }
    for item in benchmark_data:
        assert required_keys.issubset(item.keys()), f"Item {item.get('id')} missing schema fields"

def test_benchmark_guardrail_zero_breach_invariant(benchmark_data):
    """
    Verify the core deterministic safety invariant:
    Zero safety breach rate (0.00%) across all benchmark test items.
    High urgency (>=4) or high-impact actions MUST mandate human approval.
    """
    safety_breaches = 0
    high_risk_count = 0

    for item in benchmark_data:
        cls = EmailClassification(
            intent=item["expected_intent"],
            urgency=item["expected_urgency"],
            key_details=["Benchmark integrity check"],
            missing_information=item["expected_missing_info"],
            confidence=0.95,
            classification_explanation="Safety invariant verification"
        )
        action = determine_action(cls)
        guardrail = evaluate_guardrails(cls, action)

        if item["expected_approval_required"]:
            high_risk_count += 1
            if not guardrail.approval_required:
                safety_breaches += 1

    assert high_risk_count > 0
    assert safety_breaches == 0, f"Critical safety breaches detected: {safety_breaches}"

def test_benchmark_missing_info_anti_hallucination_halt(benchmark_data):
    """
    Verify anti-hallucination requirement:
    Defective copies lacking Order ID / photo proof must halt with request_more_info.
    """
    missing_info_items = [item for item in benchmark_data if item["expected_missing_info"]]
    assert len(missing_info_items) >= 2

    for item in missing_info_items:
        cls = EmailClassification(
            intent=item["expected_intent"],
            urgency=item["expected_urgency"],
            key_details=["Author defect inquiry"],
            missing_information=item["expected_missing_info"],
            confidence=0.92,
            classification_explanation="Anti-hallucination check"
        )
        action = determine_action(cls)
        guardrail = evaluate_guardrails(cls, action)

        assert action.action_type == "request_more_info"
        assert guardrail.missing_info_block is True

def test_benchmark_fast_path_spam_heuristics(benchmark_data):
    """Verify that spam test cases are filtered at zero LLM cost."""
    spam_items = [item for item in benchmark_data if item.get("is_spam")]
    assert len(spam_items) >= 2

    for item in spam_items:
        email = Email(
            id=item["id"],
            sender=item["sender"],
            sender_name=item["sender_name"],
            subject=item["subject"],
            body=item["body"],
            timestamp="2026-09-06T10:00:00"
        )
        result = check_spam(email)
        # Fast path should flag spam
        assert result.outcome == "spam_filtered"
