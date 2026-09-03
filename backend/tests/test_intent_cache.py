import uuid
import pytest
from app.models import Email, EmailClassification
from app.intent_cache import IntentCache


@pytest.fixture
def test_cache(tmp_path):
    """Provide an isolated, ephemeral IntentCache instance for each test."""
    chroma_dir = str(tmp_path / "cache_chroma")
    col_name = f"test_cache_{uuid.uuid4().hex[:8]}"
    return IntentCache(
        persist_directory=chroma_dir,
        collection_name=col_name,
        similarity_threshold=0.90,
    )


def _make_email(
    email_id: str = "1",
    subject: str = "Test subject",
    body: str = "Test body",
) -> Email:
    return Email(
        id=email_id,
        sender="test@example.com",
        sender_name="Test User",
        subject=subject,
        body=body,
        timestamp="2026-09-03T10:00:00",
    )


def _make_classification(intent: str = "royalty_payment") -> EmailClassification:
    return EmailClassification(
        intent=intent,
        urgency=3,
        key_details=["June royalty payout missing"],
        missing_information=[],
        confidence=0.92,
        classification_explanation="Author mentions missing royalty payout.",
    )


class TestCacheMiss:
    def test_empty_cache_returns_none(self, test_cache):
        """Verify no false positives on an empty cache."""
        email = _make_email(subject="Royalties not credited")
        result = test_cache.get_cached_classification(email)
        assert result is None

    def test_dissimilar_email_misses(self, test_cache):
        """Verify a completely different email topic does not hit the cache."""
        # Cache a royalty email
        royalty_email = _make_email(subject="June royalty payout delay", body="I haven't received my royalties.")
        test_cache.cache_classification(royalty_email, _make_classification("royalty_payment"))

        # Query with a printing issue email
        printing_email = _make_email(
            email_id="2",
            subject="Pages smudged in my book",
            body="The printing quality is terrible, pages are unreadable.",
        )
        result = test_cache.get_cached_classification(printing_email)
        assert result is None


class TestCacheHit:
    def test_near_duplicate_email_hits(self, test_cache):
        """Verify a near-duplicate email returns cached classification."""
        # Cache a royalty email
        original = _make_email(subject="June royalty payout missing", body="My royalties for June were not credited.")
        classification = _make_classification("royalty_payment")
        test_cache.cache_classification(original, classification)

        # Query with a slight paraphrase
        similar = _make_email(
            email_id="2",
            subject="June royalty payout missing",
            body="My royalties for June were not credited to my account.",
        )
        result = test_cache.get_cached_classification(similar)
        assert result is not None
        assert result.outcome == "cache_hit"
        assert result.classification.intent == "royalty_payment"

    def test_exact_duplicate_hits(self, test_cache):
        """Verify an exact duplicate email returns cached classification."""
        email = _make_email(subject="When will my book go live?", body="I approved the final proof two days ago.")
        classification = _make_classification("publishing_status")
        test_cache.cache_classification(email, classification)

        # Same text
        duplicate = _make_email(email_id="2", subject="When will my book go live?", body="I approved the final proof two days ago.")
        result = test_cache.get_cached_classification(duplicate)
        assert result is not None
        assert result.outcome == "cache_hit"
        assert result.classification.intent == "publishing_status"


class TestCacheInvalidation:
    def test_invalidation_clears_entries(self, test_cache):
        """Verify invalidation removes cached entries for a given intent."""
        email = _make_email(subject="Royalty question", body="Where is my payout?")
        test_cache.cache_classification(email, _make_classification("royalty_payment"))

        # Verify cache hit
        assert test_cache.get_cached_classification(email) is not None

        # Invalidate
        removed = test_cache.invalidate_for_intent("royalty_payment")
        assert removed >= 1

        # Verify cache miss after invalidation
        result = test_cache.get_cached_classification(email)
        assert result is None

    def test_invalidation_does_not_affect_other_intents(self, test_cache):
        """Verify invalidation only removes entries for the specified intent."""
        # Cache two different intents
        royalty_email = _make_email(email_id="1", subject="Royalty missing", body="June royalties.")
        test_cache.cache_classification(royalty_email, _make_classification("royalty_payment"))

        cover_email = _make_email(email_id="2", subject="New cover design", body="Please update my cover.")
        test_cache.cache_classification(cover_email, _make_classification("cover_design"))

        # Invalidate only royalty_payment
        test_cache.invalidate_for_intent("royalty_payment")

        # Royalty should be gone, cover should remain
        assert test_cache.get_cached_classification(royalty_email) is None
        # Cover design should still be cached
        cover_result = test_cache.get_cached_classification(cover_email)
        assert cover_result is not None
        assert cover_result.classification.intent == "cover_design"


class TestCacheClear:
    def test_clear_removes_all(self, test_cache):
        """Verify clear() removes all cached entries."""
        for i in range(5):
            email = _make_email(email_id=str(i), subject=f"Email {i}", body=f"Body {i}")
            test_cache.cache_classification(email, _make_classification("general_inquiry"))

        test_cache.clear()
        assert test_cache.collection.count() == 0


class TestCacheRobustness:
    def test_invalid_chroma_port_fallback(self, tmp_path, monkeypatch):
        """Verify invalid CHROMA_PORT environment string safely falls back to 8000."""
        from unittest.mock import patch, MagicMock

        monkeypatch.setenv("CHROMA_HOST", "chroma.internal")
        monkeypatch.setenv("CHROMA_PORT", "not-a-number")

        with patch("chromadb.HttpClient") as mock_client:
            mock_col = MagicMock()
            mock_client.return_value.get_or_create_collection.return_value = mock_col
            cache = IntentCache(
                persist_directory=str(tmp_path / "cache_robust"),
                collection_name="test_port_fallback",
            )
            # Port passed to HttpClient must be 8000
            _, kwargs = mock_client.call_args
            assert kwargs.get("port") == 8000
