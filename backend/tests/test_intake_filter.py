import pytest
from app.models import Email
from app.intake_filter import (
    check_spam,
    _compute_keyword_score,
    _extract_sender_domain,
    get_active_blocklist,
)


def _make_email(
    sender: str = "test@example.com",
    sender_name: str = "Test User",
    subject: str = "Test Subject",
    body: str = "Test body content",
    email_id: str = "test_1",
) -> Email:
    return Email(
        id=email_id,
        sender=sender,
        sender_name=sender_name,
        subject=subject,
        body=body,
        timestamp="2026-09-03T10:00:00",
    )


class TestSenderBlocklist:
    def test_blocked_domain_is_spam(self):
        """Verify sender on the blocklist is instantly flagged as spam."""
        email = _make_email(sender="spambot@spamservices.com", subject="Hello")
        result = check_spam(email)
        assert result.outcome == "spam_filtered"
        assert result.confidence == 0.99
        assert result.classification is not None
        assert result.classification.intent == "spam"
        assert result.action is not None
        assert result.action.action_type == "archive"

    def test_non_blocked_domain_passes(self):
        """Verify legitimate sender domain is not flagged."""
        email = _make_email(sender="priya@example.com", subject="Royalty question")
        result = check_spam(email)
        assert result.outcome == "pass_through"

    def test_dynamic_blocklist_file(self, tmp_path, monkeypatch):
        """Verify dynamic blocklist loaded from custom file and ignores invalid domains."""
        custom_file = tmp_path / "custom_blocklist.txt"
        # Includes a valid domain, a comment, an invalid domain format, and another valid domain
        custom_file.write_text("evil-spammer.org\n# comment line\ninvalid_domain_string\nanother-spammer.net\n")
        monkeypatch.setenv("SPAM_BLOCKLIST_PATH", str(custom_file))

        # Valid blocklisted domain should fail
        email = _make_email(sender="promo@evil-spammer.org", subject="Exclusive Deal")
        result = check_spam(email)
        assert result.outcome == "spam_filtered"
        
        # Ensure the invalid domain wasn't accidentally matched as a substring or similar
        active_list = get_active_blocklist()
        assert "invalid_domain_string" not in active_list
        assert "another-spammer.net" in active_list


class TestKeywordScoring:
    def test_heavy_spam_keywords_trigger(self):
        """Verify email with multiple spam keywords scores above threshold."""
        email = _make_email(
            subject="Boost your book sales with SEO!",
            body="Want to be a bestseller? Buy our guaranteed SEO services for just $99. Click here to increase your rankings.",
        )
        result = check_spam(email)
        assert result.outcome == "spam_filtered"
        assert result.classification.intent == "spam"
        assert result.confidence >= 0.80

    def test_single_weak_keyword_passes(self):
        """Verify a single weak keyword alone doesn't trigger spam."""
        email = _make_email(
            subject="SEO question",
            body="I want to optimize my book description for better discoverability.",
        )
        result = check_spam(email)
        assert result.outcome == "pass_through"

    def test_keyword_score_calculation(self):
        """Verify the keyword scoring function returns correct matches with word boundaries."""
        # Test just enough keywords to not trigger early exit, or individually
        # "guaranteed" = 0.30, "$99" = 0.20 -> total 0.50 (<0.80)
        text = "guaranteed seo services click here for $99"
        # Since 'seo services' and 'click here' are in the text, it will hit 1.05 and early exit!
        # So let's test one by one to avoid early exit short-circuiting our asserts
        
        score, matched = _compute_keyword_score("guaranteed")
        assert "guaranteed" in matched
        
        score, matched = _compute_keyword_score("seo services are good")
        assert "seo services" in matched
        
        score, matched = _compute_keyword_score("click here to begin")
        assert "click here" in matched
        
        score, matched = _compute_keyword_score("pay $99 now")
        assert "$99" in matched

    def test_word_boundary_avoids_substring_false_positives(self):
        """Verify words containing spam substrings as part of other words do not match."""
        text = "I guarantee you my bookstore is not cheap"
        score, matched = _compute_keyword_score(text)
        # 'guaranteed' should not match 'guarantee'
        assert "guaranteed" not in matched

    def test_regex_boundaries(self):
        """Verify non-alphanumeric keywords match correctly with boundaries."""
        # Matches correctly
        score, matched = _compute_keyword_score("Get it for $99 today")
        assert "$99" in matched
        
        # Does not match partially
        score2, matched2 = _compute_keyword_score("Cost is USD99 or 99$")
        assert "$99" not in matched2

    def test_additive_heuristic_score(self):
        """Verify email below keyword threshold but pushed over by heuristics."""
        # 'guaranteed' = 0.30, 'act now' = 0.20 -> 0.50 (below 0.80)
        # But URLs and caps will add heuristic weight
        email = _make_email(
            subject="GUARANTEED FAST RESULTS ACT NOW!!!",
            body="VISIT http://spam.com AND http://spam2.com OR http://spam3.com TODAY TO GET YOUR BOOK RANKED!!!",
        )
        result = check_spam(email)
        assert result.outcome == "spam_filtered"
        assert result.confidence > 0.80
        assert "High caps ratio" in result.reason
        assert "URL count" in result.reason
class TestLegitimateEmails:
    def test_royalty_query_passes(self):
        """Verify real author royalty query is not flagged as spam."""
        email = _make_email(
            sender="priya.sharma@example.com",
            sender_name="Priya Sharma",
            subject="Royalties not credited for June",
            body="Hi team, I haven't received my royalty payout for the month of June.",
        )
        result = check_spam(email)
        assert result.outcome == "pass_through"

    def test_printing_complaint_passes(self):
        """Verify angry printing complaint is not flagged as spam."""
        email = _make_email(
            sender="anita.desai@example.com",
            sender_name="Anita Desai",
            subject="URGENT: Pages smudged in my book",
            body="Pages 45-50 are completely smudged and unreadable. This is unacceptable.",
        )
        result = check_spam(email)
        assert result.outcome == "pass_through"

    def test_isbn_error_passes(self):
        """Verify ISBN metadata issue is not flagged as spam."""
        email = _make_email(
            sender="karthik.s@example.com",
            subject="Wrong ISBN on my published book!!",
            body="The ISBN printed does not match the one registered. Please fix this immediately.",
        )
        result = check_spam(email)
        assert result.outcome == "pass_through"

    def test_general_inquiry_passes(self):
        """Verify new author general inquiry passes through."""
        email = _make_email(
            sender="new.author@example.com",
            subject="How do I start self-publishing?",
            body="I have a manuscript ready and I want to self-publish. What are the steps?",
        )
        result = check_spam(email)
        assert result.outcome == "pass_through"


class TestHelpers:
    def test_extract_sender_domain(self):
        assert _extract_sender_domain("user@example.com") == "example.com"
        assert _extract_sender_domain("bot@SPAMSERVICES.COM") == "spamservices.com"
        assert _extract_sender_domain("no-at-sign") == ""

    def test_spam_result_has_complete_classification(self):
        """Verify FastPathResult for spam contains fully valid classification and action."""
        email = _make_email(sender="bot@spamservices.com")
        result = check_spam(email)
        assert result.classification is not None
        assert result.classification.urgency == 1
        assert result.classification.missing_information == []
        assert result.action is not None
        assert result.action.action_type == "archive"
