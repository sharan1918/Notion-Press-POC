from app.models import EmailClassification, RecommendedAction, GuardrailResult
from app.config import HIGH_IMPACT_ACTIONS, URGENCY_APPROVAL_THRESHOLD, CONFIDENCE_APPROVAL_THRESHOLD, INTENT_TO_TEAM

def determine_action(classification: EmailClassification) -> RecommendedAction:
    intent = classification.intent
    
    if intent == "spam":
        return RecommendedAction(action_type="archive", description="Auto-archive spam email")
    elif intent == "general_inquiry":
        return RecommendedAction(action_type="auto_reply", description="Send FAQ auto-reply")
    elif intent == "complaint":
        target_team = INTENT_TO_TEAM.get(intent)
        return RecommendedAction(action_type="escalate", description=f"Escalate to {target_team}", target_team=target_team)
    elif intent == "isbn_metadata":
        target_team = INTENT_TO_TEAM.get(intent)
        return RecommendedAction(action_type="modify_metadata", description="Modify ISBN/Metadata", target_team=target_team)
    elif classification.missing_information:
        return RecommendedAction(action_type="request_more_info", description="Request missing information from author")
    else:
        # For royalty_payment, publishing_status, printing_issue, cover_design, distribution
        target_team = INTENT_TO_TEAM.get(intent)
        return RecommendedAction(action_type="route_to_team", description=f"Route to {target_team} team", target_team=target_team)


def evaluate_guardrails(classification: EmailClassification, action: RecommendedAction) -> GuardrailResult:
    approval_required = False
    missing_info_block = False
    reasons = []

    # High-impact actions always need approval
    if action.action_type in HIGH_IMPACT_ACTIONS:
        approval_required = True
        reasons.append(f"High-impact action: {action.action_type}")

    # High urgency needs approval
    if classification.urgency >= URGENCY_APPROVAL_THRESHOLD:
        approval_required = True
        reasons.append(f"High urgency: {classification.urgency}/5")

    # Low confidence needs approval
    if classification.confidence < CONFIDENCE_APPROVAL_THRESHOLD:
        approval_required = True
        reasons.append(f"Low confidence: {classification.confidence:.0%}")

    # Missing information blocks execution entirely
    if classification.missing_information:
        missing_info_block = True
        reasons.append("Missing required information — cannot proceed")

    risk_level = "high" if action.action_type in ("issue_refund", "modify_metadata", "escalate") \
                 else "medium" if approval_required else "low"

    return GuardrailResult(
        approval_required=approval_required,
        missing_info_block=missing_info_block,
        reasons=reasons,
        risk_level=risk_level
    )
