import os
import pytest
from unittest.mock import MagicMock, patch
from app.models import Email, EmailClassification, RecommendedAction
from app.knowledge_base import AuthorKnowledgeBase, author_knowledge_base
from app.pdf_parser import extract_text_from_pdf_bytes, chunk_document_text, infer_intent
from app.graph import generate_rag_reply, determine_action_node
from app.policy import determine_action

def get_sample_pdf_path():
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "sample_docs", "Notion_Press_Author_Publishing_Policy_Handbook.pdf")
    )

def test_pdf_parser_and_chunking():
    pdf_path = get_sample_pdf_path()
    assert os.path.exists(pdf_path), f"Sample PDF missing at {pdf_path}"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text = extract_text_from_pdf_bytes(pdf_bytes)
    assert "Notion Press" in text
    assert "Royalty" in text or "Profit" in text

    chunks = chunk_document_text(text, "Handbook.pdf")
    assert len(chunks) >= 5
    for chunk in chunks:
        assert "id" in chunk
        assert "title" in chunk
        assert "content" in chunk
        assert "intent" in chunk

def test_dynamic_document_lifecycle(tmp_path):
    kb = AuthorKnowledgeBase(persist_directory=str(tmp_path / "kb_dynamic"))
    # Initially empty
    assert len(kb.list_documents()) == 0
    assert kb.query_knowledge("how do royalties work?") == []

    # Ingest document
    sample_chunks = [
        {
            "id": "doc1_chunk_1",
            "title": "Royalty & Payout Guidelines",
            "intent": "general_inquiry",
            "content": "Authors receive 100% of Net Author Profit on the 10th of every month. Minimum threshold ₹1,000.",
            "chunk_index": 1,
        },
        {
            "id": "doc1_chunk_2",
            "title": "ISBN Rules",
            "intent": "general_inquiry",
            "content": "Free 13-digit ISBN is assigned upon project setup.",
            "chunk_index": 2,
        }
    ]
    added = kb.add_document_chunks("doc1.pdf", sample_chunks)
    assert added == 2
    assert len(kb.list_documents()) == 1
    assert kb.list_documents()[0]["filename"] == "doc1.pdf"

    # Query
    results = kb.query_knowledge("what is the royalty payout threshold?", intent="general_inquiry")
    assert len(results) > 0
    assert "1,000" in results[0]["content"]

    # Delete
    deleted = kb.delete_document("doc1.pdf")
    assert deleted == 2
    assert len(kb.list_documents()) == 0
    assert kb.query_knowledge("royalty") == []

def test_clear_all_knowledge_base(tmp_path):
    kb = AuthorKnowledgeBase(persist_directory=str(tmp_path / "kb_clear"))
    chunks = [
        {"id": "c1", "title": "Section 1", "intent": "general_inquiry", "content": "Publishing steps", "chunk_index": 1}
    ]
    kb.add_document_chunks("guide.pdf", chunks)
    assert len(kb.list_documents()) == 1

    kb.clear_all()
    assert len(kb.list_documents()) == 0
    assert kb.get_status()["total_documents"] == 0

def test_query_knowledge_general_inquiry():
    # Ingest sample handbook into singleton for integration tests
    pdf_path = get_sample_pdf_path()
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        text = extract_text_from_pdf_bytes(pdf_bytes)
        chunks = chunk_document_text(text, "Notion_Press_Author_Publishing_Policy_Handbook.pdf")
        author_knowledge_base.add_document_chunks("Notion_Press_Author_Publishing_Policy_Handbook.pdf", chunks)

    docs = author_knowledge_base.query_knowledge(
        query_text="How do I self-publish my manuscript and what are the steps?",
        intent="general_inquiry",
        top_k=2
    )
    assert len(docs) > 0
    titles = [d["title"] for d in docs]
    assert any("Publishing" in t or "Royalty" in t or "ISBN" in t for t in titles)

def test_query_knowledge_publishing_status():
    docs = author_knowledge_base.query_knowledge(
        query_text="When will my approved proof go live on Amazon and Flipkart?",
        intent="publishing_status",
        top_k=2
    )
    assert len(docs) > 0
    titles = [d["title"] for d in docs]
    assert any("Turnaround" in t or "SLA" in t or "Production" in t or "Go-Live" in t for t in titles)

def test_policy_multi_intent_auto_reply():
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
