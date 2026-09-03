"""
Fast-path intake filter for deterministic spam detection.

Catches obvious spam emails via heuristic rules before they reach the LLM pipeline.
Zero API calls, ~1ms per email.

Scoring layers:
1. Sender domain blocklist (instant match → spam)
2. Weighted keyword scoring across subject + body
3. Text heuristics: excessive caps, URL density, exclamation marks
"""

import re
import logging
from app.models import Email, EmailClassification, RecommendedAction, FastPathResult
from app.config import SPAM_KEYWORDS, SPAM_SENDER_BLOCKLIST, SPAM_CONFIDENCE_THRESHOLD

logger = logging.getLogger(__name__)

# ── Heuristic weight contributions ───────────────────────────────────────────
_CAPS_RATIO_THRESHOLD = 0.40     # If > 40% uppercase chars → suspicious
_CAPS_RATIO_WEIGHT = 0.15
_URL_COUNT_THRESHOLD = 2         # 3+ URLs → suspicious
_URL_COUNT_WEIGHT = 0.10
_EXCLAMATION_THRESHOLD = 3       # 4+ exclamation marks → suspicious
_EXCLAMATION_WEIGHT = 0.10

_URL_PATTERN = re.compile(r'https?://\S+|www\.\S+', re.IGNORECASE)


def _extract_sender_domain(sender_email: str) -> str:
    """Extract domain from sender email address."""
    if "@" in sender_email:
        return sender_email.split("@")[-1].strip().lower()
    return ""


def _compute_keyword_score(text: str) -> tuple[float, list[str]]:
    """
    Score text against weighted spam keywords.
    Returns (total_score, list_of_matched_keywords).
    """
    text_lower = text.lower()
    total = 0.0
    matched = []
    for keyword, weight in SPAM_KEYWORDS.items():
        if keyword in text_lower:
            total += weight
            matched.append(keyword)
    return total, matched


def _compute_heuristic_score(subject: str, body: str) -> tuple[float, list[str]]:
    """
    Score text with structural heuristics (caps ratio, URL count, exclamation density).
    Returns (total_score, list_of_triggered_heuristics).
    """
    combined = f"{subject} {body}"
    score = 0.0
    reasons = []

    # Caps ratio
    alpha_chars = [c for c in combined if c.isalpha()]
    if alpha_chars:
        caps_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
        if caps_ratio > _CAPS_RATIO_THRESHOLD:
            score += _CAPS_RATIO_WEIGHT
            reasons.append(f"High caps ratio: {caps_ratio:.0%}")

    # URL density
    url_count = len(_URL_PATTERN.findall(combined))
    if url_count > _URL_COUNT_THRESHOLD:
        score += _URL_COUNT_WEIGHT
        reasons.append(f"URL count: {url_count}")

    # Exclamation marks
    excl_count = combined.count("!")
    if excl_count > _EXCLAMATION_THRESHOLD:
        score += _EXCLAMATION_WEIGHT
        reasons.append(f"Exclamation marks: {excl_count}")

    return score, reasons


def check_spam(email: Email) -> FastPathResult:
    """
    Run deterministic spam detection on an email.

    Returns FastPathResult with:
    - outcome="spam_filtered" + pre-built classification/action if spam detected
    - outcome="pass_through" if email should proceed to LLM pipeline
    """
    sender_domain = _extract_sender_domain(email.sender)
    combined_text = f"{email.subject} {email.body}"

    # ── Layer 1: Sender blocklist (instant match) ────────────────────────
    if sender_domain in SPAM_SENDER_BLOCKLIST:
        reason = f"Sender domain '{sender_domain}' is on the blocklist"
        logger.info(f"[INTAKE] SPAM (blocklist): {email.sender} — {reason}")
        return _build_spam_result(confidence=0.99, reason=reason)

    # ── Layer 2: Weighted keyword scoring ────────────────────────────────
    keyword_score, matched_keywords = _compute_keyword_score(combined_text)

    # ── Layer 3: Text heuristics ─────────────────────────────────────────
    heuristic_score, heuristic_reasons = _compute_heuristic_score(email.subject, email.body)

    total_score = keyword_score + heuristic_score

    if total_score >= SPAM_CONFIDENCE_THRESHOLD:
        all_reasons = []
        if matched_keywords:
            all_reasons.append(f"Keywords: {', '.join(matched_keywords)}")
        all_reasons.extend(heuristic_reasons)
        reason = f"Spam score {total_score:.2f} >= {SPAM_CONFIDENCE_THRESHOLD} — {'; '.join(all_reasons)}"
        logger.info(f"[INTAKE] SPAM (heuristic): {email.sender} — {reason}")
        return _build_spam_result(confidence=min(total_score, 1.0), reason=reason)

    # ── Pass through to LLM pipeline ────────────────────────────────────
    logger.info(
        f"[INTAKE] PASS: {email.sender} — spam score {total_score:.2f} < {SPAM_CONFIDENCE_THRESHOLD}"
    )
    return FastPathResult(outcome="pass_through", confidence=total_score, reason="Below spam threshold")


def _build_spam_result(confidence: float, reason: str) -> FastPathResult:
    """Build a complete FastPathResult for detected spam with pre-filled classification and action."""
    classification = EmailClassification(
        intent="spam",
        urgency=1,
        key_details=["Detected by fast-path intake filter (no LLM used)"],
        missing_information=[],
        confidence=confidence,
        classification_explanation=f"Fast-path filter: {reason}"
    )
    action = RecommendedAction(
        action_type="archive",
        description="Auto-archive spam email (fast-path filtered)"
    )
    return FastPathResult(
        outcome="spam_filtered",
        confidence=confidence,
        reason=reason,
        classification=classification,
        action=action
    )
