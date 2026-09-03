"""
Fast-path intake filter for deterministic spam detection.

Catches obvious spam emails via heuristic rules before they reach the LLM pipeline.
Zero API calls, ~1ms per email.

Scoring layers:
1. Sender domain blocklist (instant match → spam)
2. Weighted keyword scoring across subject + body
3. Text heuristics: excessive caps, URL density, exclamation marks
"""

import os
import re
import logging
from app.models import Email, EmailClassification, RecommendedAction, FastPathResult
from app.config import SPAM_KEYWORDS, SPAM_SENDER_BLOCKLIST, SPAM_CONFIDENCE_THRESHOLD, SPAM_HEURISTICS_CONFIG

logger = logging.getLogger(__name__)

_URL_PATTERN = re.compile(r'https?://\S+|www\.\S+', re.IGNORECASE)


def _build_keyword_regex(keyword: str) -> re.Pattern:
    """
    Build word-boundary-aware regex pattern for a keyword to prevent substring false positives.
    Note: \\b uses ASCII boundaries by default. In Python 3, re.UNICODE is default, but
    \\b behavior around non-Latin scripts can still be surprising.
    """
    escaped = re.escape(keyword)
    left_bound = r'(?<!\w)' if not keyword[0].isalnum() else r'\b'
    right_bound = r'(?!\w)' if not keyword[-1].isalnum() else r'\b'
    return re.compile(left_bound + escaped + right_bound, re.IGNORECASE | re.UNICODE)


_COMPILED_SPAM_PATTERNS = {
    keyword: _build_keyword_regex(keyword) for keyword in SPAM_KEYWORDS
}


def get_active_blocklist() -> set[str]:
    """
    Return active sender blocklist, merging static SPAM_SENDER_BLOCKLIST
    with optional runtime blocklist file (data/spam_blocklist.txt).
    """
    blocklist = set(SPAM_SENDER_BLOCKLIST)
    custom_path = os.environ.get("SPAM_BLOCKLIST_PATH", "data/spam_blocklist.txt")
    if os.path.exists(custom_path):
        try:
            with open(custom_path, "r", encoding="utf-8") as f:
                for line in f:
                    domain = line.strip().lower()
                    if domain and not domain.startswith("#"):
                        if len(domain) < 255 and re.match(r'^[a-z0-9.-]+\.[a-z]{2,}$', domain):
                            blocklist.add(domain)
                        else:
                            logger.warning(f"Skipped invalid blocklist domain: {domain}")
        except FileNotFoundError:
            pass
        except OSError as e:
            logger.warning(f"Could not load custom spam blocklist from {custom_path}: {e}")
    return blocklist


def _extract_sender_domain(sender_email: str) -> str:
    """Extract domain from sender email address."""
    if "@" in sender_email:
        return sender_email.split("@")[-1].strip().lower()
    return ""


def _compute_keyword_score(text: str) -> tuple[float, list[str]]:
    """
    Score text against weighted spam keywords using word-boundary matching.
    Returns (total_score, list_of_matched_keywords).
    """
    total = 0.0
    matched = []
    for keyword, weight in SPAM_KEYWORDS.items():
        pattern = _COMPILED_SPAM_PATTERNS.get(keyword)
        if pattern and pattern.search(text):
            total += weight
            matched.append(keyword)
            if total >= SPAM_CONFIDENCE_THRESHOLD:
                break
    return total, matched


def _compute_heuristic_score(combined_text: str) -> tuple[float, list[str]]:
    """
    Score text with structural heuristics (caps ratio, URL count, exclamation density).
    Returns (total_score, list_of_triggered_heuristics).
    """
    score = 0.0
    reasons = []

    # Caps ratio
    alpha_chars = [c for c in combined_text if c.isalpha()]
    if alpha_chars:
        caps_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
        if caps_ratio > SPAM_HEURISTICS_CONFIG.caps_ratio_threshold:
            score += SPAM_HEURISTICS_CONFIG.caps_ratio_weight
            reasons.append(f"High caps ratio: {caps_ratio:.0%}")

    # URL density
    url_count = len(_URL_PATTERN.findall(combined_text))
    if url_count > SPAM_HEURISTICS_CONFIG.url_count_threshold:
        score += SPAM_HEURISTICS_CONFIG.url_count_weight
        reasons.append(f"URL count: {url_count}")

    # Exclamation marks
    excl_count = combined_text.count("!")
    if excl_count > SPAM_HEURISTICS_CONFIG.exclamation_threshold:
        score += SPAM_HEURISTICS_CONFIG.exclamation_weight
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
    active_blocklist = get_active_blocklist()
    if sender_domain in active_blocklist:
        reason = f"Sender domain '{sender_domain}' is on the blocklist"
        logger.info(f"[INTAKE] SPAM (blocklist): {email.sender} — {reason}")
        return _build_spam_result(confidence=0.99, reason=reason)

    # ── Layer 2: Weighted keyword scoring ────────────────────────────────
    keyword_score, matched_keywords = _compute_keyword_score(combined_text)

    # ── Layer 3: Text heuristics ─────────────────────────────────────────
    heuristic_score, heuristic_reasons = _compute_heuristic_score(combined_text)
    total_score = keyword_score + heuristic_score

    if total_score >= SPAM_CONFIDENCE_THRESHOLD:
        all_reasons = []
        if matched_keywords:
            all_reasons.append(f"Keywords: {', '.join(matched_keywords)}")
        all_reasons.extend(heuristic_reasons)
        reason = f"Spam score {total_score:.2f} >= {SPAM_CONFIDENCE_THRESHOLD} — {'; '.join(all_reasons)}"
        logger.info(f"[INTAKE] SPAM (score={total_score:.2f}): {email.sender} — {reason}")
        return _build_spam_result(confidence=min(0.99, total_score), reason=reason)

    # ── Pass through to LLM pipeline ────────────────────────────────────
    logger.debug(
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
