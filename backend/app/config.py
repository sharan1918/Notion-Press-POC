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
    "printing_issue": "QA",
    "cover_design": "Design",
    "distribution": "Distribution",
    "isbn_metadata": "Metadata",
    "complaint": "Senior Support",
}
