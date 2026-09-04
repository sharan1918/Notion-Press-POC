import pytest
from unittest.mock import MagicMock, patch
from app.models import Email, EmailClassification, RecommendedAction
from app.knowledge_base import AuthorKnowledgeBase, SEED_KNOWLEDGE_DOCUMENTS, author_knowledge_base
from app.graph import generate_rag_reply, determine_action_node
from app.policy import determine_action

def test_seed_knowledge_documents_count():
    assert len(SEED_KNOWLEDGE_DOCUMENTS) >= 5
    intents = {doc["intent"] for doc in SEED_KNOWLEDGE_DOCUMENTS}
    assert "general_inquiry" in intents
    assert "publishing_status" in intents
    assert "distribution" in intents

def test_query_knowledge_general_inquiry():
    docs = author_knowledge_base.query_knowledge(
        query_text="How do I self-publish my manuscript and what are the steps?",
        intent="general_inquiry",
        top_k=2
    )
    assert len(docs) > 0
    titles = [d["title"] for d in docs]
    assert any("Publishing Roadmap" in t or "Royalty" in t or "ISBN" in t for t in titles)

def test_query_knowledge_publishing_status():
    docs = author_knowledge_base.query_knowledge(
        query_text="When will my approved proof go live on Amazon and Flipkart?",
        intent="publishing_status",
        top_k=2
    )
    assert len(docs) > 0
    titles = [d["title"] for d in docs]
    assert any("Turnaround" in t or "SLA" in t for t in titles)

def test_query_knowledge_distribution():
    docs = author_knowledge_base.query_knowledge(
        query_text="Why is my book not showing on Flipkart search results?",
        intent="distribution",
        top_k=2
    )
    assert len(docs) > 0
    titles = [d["title"] for d in docs]
    assert any("Distribution" in t or "Indexing" in t for t in titles)

def test_in_memory_fallback(tmp_path):
    kb = AuthorKnowledgeBase(persist_directory=str(tmp_path / "kb_test"))
    # Force collection to None to test fallback
    kb.collection = None
    results = kb.query_knowledge("royalty payment calculation formula", intent="general_inquiry")
    assert len(results) > 0
    assert "Royalty" in results[0]["title"] or "Profit" in results[0]["content"]

def test_policy_multi_intent_auto_reply():
    # general_inquiry -> auto_reply
    cls_general = EmailClassification(
        intent="general_inquiry",
        urgency=2,
        key_details=["Self-publishing steps"],
        missing_information=[],
        confidence=0.95,
        classification_explanation="Author asks general publishing questions"
    )
    action_general = determine_action(cls_general)
    assert action_general.action_type == "auto_reply"

    # publishing_status -> auto_reply
    cls_status = EmailClassification(
        intent="publishing_status",
        urgency=2,
        key_details=["Turnaround time"],
        missing_information=[],
        confidence=0.92,
        classification_explanation="Author asks when book will go live"
    )
    action_status = determine_action(cls_status)
    assert action_status.action_type == "auto_reply"

    # distribution -> auto_reply
    cls_dist = EmailClassification(
        intent="distribution",
        urgency=3,
        key_details=["Flipkart sync"],
        missing_information=[],
        confidence=0.90,
        classification_explanation="Author asks about distributor indexing"
    )
    action_dist = determine_action(cls_dist)
    assert action_dist.action_type == "auto_reply"

    # missing information blocks auto_reply
    cls_missing = EmailClassification(
        intent="publishing_status",
        urgency=3,
        key_details=["Status query"],
        missing_information=["Book Title", "Order ID"],
        confidence=0.92,
        classification_explanation="Missing title"
    )
    action_missing = determine_action(cls_missing)
    assert action_missing.action_type == "request_more_info"

def test_generate_rag_reply_integration():
    email = Email(
        id="test_rag_1",
        sender="writer@example.com",
        sender_name="Vikram Mehta",
        subject="When will my book be available on Amazon?",
        body="I approved the final proof 2 days ago. What is the timeline for Amazon?",
        timestamp="2026-09-03T12:00:00"
    )
    cls = EmailClassification(
        intent="publishing_status",
        urgency=2,
        key_details=["Proof approved 2 days ago"],
        missing_information=[],
        confidence=0.96,
        classification_explanation="Timeline query for Amazon"
    )
    state = {
        "email": email,
        "classification": cls,
        "processing_log": [],
        "draft_response": None,
        "knowledge_sources": None
    }

    res_state = generate_rag_reply(state)
    assert res_state["draft_response"] is not None
    assert len(res_state["draft_response"]) > 20
    assert res_state["knowledge_sources"] is not None
    assert len(res_state["knowledge_sources"]) > 0
