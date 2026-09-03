import os
import uuid
import pytest
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor
from app.models import HumanCorrection
from app.feedback_store import FeedbackStore

@pytest.fixture
def test_store(tmp_path):
    """Provide an isolated, ephemeral FeedbackStore instance for each test."""
    chroma_dir = str(tmp_path / "chroma")
    json_path = str(tmp_path / "corrections.json")
    col_name = f"test_col_{uuid.uuid4().hex}"
    return FeedbackStore(
        persist_directory=chroma_dir,
        json_path=json_path,
        collection_name=col_name,
        similarity_threshold=0.40
    )

def test_chroma_collection_cosine_space(test_store):
    """Verify that Chroma collection is initialized with explicit cosine metric."""
    metadata = test_store.collection.metadata
    assert metadata is not None
    assert metadata.get("hnsw:space") == "cosine"

def test_relevant_semantic_retrieval(test_store):
    """Verify that semantically similar paraphrased email retrieves historical correction."""
    corr = HumanCorrection(
        email_subject="Smudged pages in author copies",
        email_body="Pages 45-50 are completely smudged and unreadable in the printed book.",
        original_intent="general_inquiry",
        corrected_intent="printing_issue",
        notes="Defective physical print pages must be classified as printing_issue.",
        timestamp="2026-09-02T10:00:00"
    )
    test_store.save_correction(corr)

    # Query with a paraphrased semantic variation (different wording)
    query = "Subject: Print quality defect\nBody: The text is blurry and ink is smeared on pages 45 to 50 of my book copies."
    results = test_store.get_relevant_corrections(query_text=query)

    assert len(results) >= 1
    assert results[0].corrected_intent == "printing_issue"
    assert "printing_issue" in test_store.format_for_prompt(results)

def test_irrelevant_query_threshold_rejection(test_store):
    """Verify that completely unrelated email text is filtered out by the similarity threshold."""
    corr = HumanCorrection(
        email_subject="June royalty payout delay",
        email_body="I have not received my author royalty payment for June into my bank account.",
        original_intent="general_inquiry",
        corrected_intent="royalty_payment",
        notes="Financial royalties must route to royalty_payment.",
        timestamp="2026-09-02T10:00:00"
    )
    test_store.save_correction(corr)

    # Query with completely unrelated recipe text
    unrelated_query = "Subject: Delicious chocolate cake recipe\nBody: Mix two cups of flour with sugar, butter, and cocoa powder."
    results = test_store.get_relevant_corrections(query_text=unrelated_query, similarity_threshold=0.55)

    # Must reject and return empty list
    assert len(results) == 0

def test_configurable_similarity_threshold(test_store):
    """Verify threshold can be dynamically adjusted or passed per query."""
    corr = HumanCorrection(
        email_subject="Book cover design update",
        email_body="Can you please replace my front cover artwork with this new high resolution file?",
        original_intent="general_inquiry",
        corrected_intent="cover_design",
        notes="Cover modifications route to cover_design.",
        timestamp="2026-09-02T10:00:00"
    )
    test_store.save_correction(corr)

    semi_related_query = "Subject: Artwork questions\nBody: What are the format specifications for cover artwork images?"

    # Relaxed threshold allows match
    relaxed_results = test_store.get_relevant_corrections(query_text=semi_related_query, similarity_threshold=0.10)
    assert len(relaxed_results) == 1

    # Super strict threshold rejects match
    strict_results = test_store.get_relevant_corrections(query_text=semi_related_query, similarity_threshold=0.95)
    assert len(strict_results) == 0

def test_persistence_and_rehydration(tmp_path):
    """Verify that corrections survive instance recreation and rehydrate from persistent store."""
    chroma_dir = str(tmp_path / "persist_chroma")
    json_path = str(tmp_path / "persist_corrections.json")
    col_name = "shared_persistent_collection"

    store1 = FeedbackStore(persist_directory=chroma_dir, json_path=json_path, collection_name=col_name)
    corr = HumanCorrection(
        email_subject="ISBN mismatched on barcode",
        email_body="The printed barcode has an incorrect ISBN number.",
        original_intent="printing_issue",
        corrected_intent="isbn_metadata",
        notes="Barcode/ISBN metadata issue.",
        timestamp="2026-09-02T11:00:00"
    )
    store1.save_correction(corr)
    assert len(store1.get_all_corrections()) == 1

    # Create new instance pointing to same persistent directory
    store2 = FeedbackStore(persist_directory=chroma_dir, json_path=json_path, collection_name=col_name)
    assert len(store2.get_all_corrections()) == 1
    
    query = "Subject: Barcode ISBN error\nBody: The ISBN printed on the back cover is wrong."
    results = store2.get_relevant_corrections(query_text=query)
    assert len(results) == 1
    assert results[0].corrected_intent == "isbn_metadata"

def test_concurrency_safety(test_store):
    """Verify thread-safe concurrent saves and reads."""
    def write_correction(idx: int):
        c = HumanCorrection(
            email_subject=f"Query {idx}",
            email_body=f"Email body for index {idx}",
            original_intent="general_inquiry",
            corrected_intent="royalty_payment" if idx % 2 == 0 else "printing_issue",
            notes=f"Note {idx}",
            timestamp=f"2026-09-02T12:00:{idx:02d}"
        )
        test_store.save_correction(c)

    # 10 concurrent writes
    with ThreadPoolExecutor(max_workers=5) as executor:
        list(executor.map(write_correction, range(10)))

    all_corr = test_store.get_all_corrections()
    assert len(all_corr) == 10

def test_managed_cloud_http_client_initialization(tmp_path):
    """Verify that CHROMA_HOST environment variable triggers HttpClient for cloud deployments."""
    chroma_dir = str(tmp_path / "cloud_test")
    json_path = str(tmp_path / "cloud_test.json")

    with patch.dict("os.environ", {"CHROMA_HOST": "chroma.notionpress.cloud", "CHROMA_PORT": "8000"}):
        with patch("chromadb.HttpClient") as mock_http_client:
            mock_collection = MagicMock()
            mock_collection.count.return_value = 0
            mock_http_client.return_value.get_or_create_collection.return_value = mock_collection
            
            store = FeedbackStore(persist_directory=chroma_dir, json_path=json_path)
            
            mock_http_client.assert_called_once()
            assert store.collection == mock_collection
