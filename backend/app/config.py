# LLM Reliability
MAX_LLM_RETRIES = 2   # 2 retry attempts after initial failure → 3 total LLM attempts

# Feedback Loop
MAX_CORRECTIONS = 3    # Max corrections per email before forced manual review

# Guardrail Thresholds
HIGH_IMPACT_ACTIONS = {"issue_refund", "modify_metadata", "escalate"}
URGENCY_APPROVAL_THRESHOLD = 4
CONFIDENCE_APPROVAL_THRESHOLD = 0.70

# Team Routing
INTENT_TO_TEAM = {
    "royalty_payment": "Finance",
    "publishing_status": "Publishing Operations",
    "printing_issue": "QA & Printing",
    "cover_design": "Design",
    "distribution": "Distribution",
    "isbn_metadata": "Metadata",
    "general_inquiry": "Author Support",
    "complaint": "Senior Support",
}

# ── Intake Filter: Fast-Path Spam Detection ──────────────────────────────────
# Weighted keyword scoring — each keyword contributes its weight to the spam score.
# If total score >= SPAM_CONFIDENCE_THRESHOLD, email is classified as spam without LLM.
SPAM_KEYWORDS = {
    # High-signal commercial spam indicators
    "guaranteed": 0.30,
    "click here": 0.25,
    "buy now": 0.25,
    "limited time offer": 0.25,
    "act now": 0.20,
    "bestseller hack": 0.30,
    "increase your rankings": 0.25,
    "seo services": 0.30,
    "just $": 0.20,
    "$99": 0.20,
    "$49": 0.20,
    "free trial": 0.15,
    "unsubscribe": 0.10,
    "no obligation": 0.15,
    "double your sales": 0.25,
    "marketing services": 0.20,
    "book promotion package": 0.20,
    "social media boost": 0.15,
}

# Known spam sender domains — instant spam classification
SPAM_SENDER_BLOCKLIST = {
    "spamservices.com",
    "marketing-blast.com",
    "seo-guru.net",
    "bookpromo-spam.com",
    "bulkmail.org",
    "cheapmarketing.io",
}

# Minimum aggregate spam score to classify without LLM
SPAM_CONFIDENCE_THRESHOLD = 0.80

# ── Intake Filter: Semantic Intent Cache ─────────────────────────────────────
# Cosine similarity threshold for intent cache hits.
# Only near-duplicate emails (>= 0.90) reuse cached classifications.
INTENT_CACHE_SIMILARITY_THRESHOLD = 0.90

# ── Batch Triage ─────────────────────────────────────────────────────────────
# Delay between sequential LLM calls in batch triage (seconds).
# Free-tier Groq has 8000 TPM — spacing calls prevents 429 rate limits.
TRIAGE_DELAY_SECONDS = 3
