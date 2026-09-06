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

def test_benchmark_rag_retrieval_precision_recall_f1(benchmark_data):
    """
    Verify RAG Retrieval metrics across all benchmark policy test cases with top_k=2:
    - Target section present and retrieved in top-2 chunks (Recall@2 >= 80%)
    - Top-2 chunks are relevant to publishing domain (Precision@2 >= 60%)
    - Harmonic Mean Retrieval F1 >= 0.70
    - Ground-truth turnaround SLAs are grounded in retrieved context (SLA Match = 100%)
    """
    from app.knowledge_base import author_knowledge_base

    rag_items = [item for item in benchmark_data if item.get("rag_evaluation", {}).get("is_rag_query")]
    assert len(rag_items) >= 5, f"Expected at least 5 RAG test cases, found {len(rag_items)}"

    precisions = []
    recalls = []
    f1_scores = []
    sla_matches = 0

    for item in rag_items:
        rag_meta = item["rag_evaluation"]
        assert "target_section" in rag_meta, f"{item['id']} missing target_section"
        assert "relevant_sections" in rag_meta, f"{item['id']} missing relevant_sections"
        assert "reference_answer" in rag_meta, f"{item['id']} missing reference_answer"

        query_text = f"{item['subject']}\n{item['body']}"
        chunks = author_knowledge_base.query_knowledge(query_text=query_text, top_k=2)
        assert len(chunks) > 0, f"No chunks retrieved for {item['id']}"

        titles = [c.get("title", "") for c in chunks]
        context = "\n".join([c.get("content", "") for c in chunks])

        rel_sections = rag_meta["relevant_sections"]
        rel_hits = [t for t in titles if any(rs.lower() in t.lower() or t.lower() in rs.lower() for rs in rel_sections)]

        prec = len(rel_hits) / len(chunks)
        rec = 1.0 if len(rel_hits) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        precisions.append(prec)
        recalls.append(rec)
        f1_scores.append(f1)

        exp_slas = rag_meta.get("expected_slas", [])
        if any(sla.lower() in context.lower() for sla in exp_slas):
            sla_matches += 1

    macro_p = sum(precisions) / len(precisions)
    macro_r = sum(recalls) / len(recalls)
    macro_f1 = sum(f1_scores) / len(f1_scores)
    sla_rate = sla_matches / len(rag_items)

    assert macro_r >= 0.80, f"RAG Recall@2 {macro_r:.2f} below target 0.80"
    assert macro_p >= 0.60, f"RAG Precision@2 {macro_p:.2f} below target 0.60"
    assert macro_f1 >= 0.70, f"RAG Retrieval F1 {macro_f1:.2f} below target 0.70"
    assert sla_rate == 1.0, f"RAG SLA Match Rate {sla_rate:.1%} must be 100%"


