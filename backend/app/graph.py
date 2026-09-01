from datetime import datetime
from pydantic import ValidationError
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command

from app.models import EmailProcessingState, EmailClassification, HumanCorrection, HumanDecision
from app.policy import determine_action, evaluate_guardrails
from app.config import MAX_LLM_RETRIES, MAX_CORRECTIONS
from app.prompts import build_prompt
from app.feedback_store import feedback_store

llm = ChatGoogleGenerativeAI(model="gemini-3.6-flash")

def log(state: dict, message: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    state.setdefault("processing_log", []).append(f"[{timestamp}] {message}")
    print(f"[{timestamp}] {message}")

def ingest_email(state: EmailProcessingState) -> EmailProcessingState:
    # Initialize basic state
    state["retry_count"] = 0
    state["correction_count"] = 0
    state["processing_log"] = state.get("processing_log", [])
    state["final_status"] = "processing"
    state["supplementary_info"] = state.get("supplementary_info", None)
    
    email = state["email"]
    log(state, f"Email received from {email.sender}: {email.subject}")
    return state

def fetch_and_classify(state: EmailProcessingState) -> EmailProcessingState:
    email = state["email"]
    
    # If we are re-classifying after correction, use previous classification intent to fetch relevant corrections
    prev_classification = state.get("classification")
    predicted_intent = prev_classification.intent if prev_classification else None
    
    corrections = feedback_store.get_relevant_corrections(predicted_intent=predicted_intent)
    corrections_text = feedback_store.format_for_prompt(corrections)
    state["corrections"] = corrections_text
    
    prompt = build_prompt(
        email_subject=email.subject, 
        email_body=email.body, 
        corrections_text=corrections_text,
        supplementary_info=state.get("supplementary_info", "")
    )
    
    structured_llm = llm.with_structured_output(EmailClassification)
    
    try:
        classification = structured_llm.invoke(prompt)
        state["classification"] = classification
        state["retry_count"] = 0 # reset on success
        log(state, f"Classification successful: {classification.intent}")
    except Exception as e:
        retry_count = state.get("retry_count", 0) + 1
        state["retry_count"] = retry_count
        if retry_count <= MAX_LLM_RETRIES:
            log(state, f"LLM failed ({e}), retry {retry_count}/{MAX_LLM_RETRIES}")
        else:
            log(state, f"LLM failed after {MAX_LLM_RETRIES} retries. Routing to manual review.")
            state["final_status"] = "error"
    return state

def route_after_classify(state: EmailProcessingState) -> str:
    if state["final_status"] == "error":
        return END # LLM failed after all retries
    if state.get("retry_count", 0) > 0:
        return "fetch_and_classify" # Loop back for retry
    return "determine_action"

def determine_action_node(state: EmailProcessingState) -> EmailProcessingState:
    classification = state["classification"]
    
    action = determine_action(classification)
    guardrail = evaluate_guardrails(classification, action)
    
    state["recommended_action"] = action
    state["guardrail_result"] = guardrail
    state["approval_required"] = guardrail.approval_required
    state["missing_info_block"] = guardrail.missing_info_block
    
    if guardrail.missing_info_block:
        state["final_status"] = "pending_info"
    elif guardrail.approval_required:
        state["final_status"] = "pending_approval"
    else:
        state["final_status"] = "processing"
    
    log(state, f"Determined action: {action.action_type}. Guardrail eval: safe={not guardrail.approval_required and not guardrail.missing_info_block}")
    return state

def route_after_policy(state: EmailProcessingState) -> str:
    guardrail = state["guardrail_result"]
    if guardrail.missing_info_block:
        return "request_info"
    if guardrail.approval_required:
        return "human_approval"
    return "execute_action"

def request_info(state: EmailProcessingState) -> EmailProcessingState:
    state["final_status"] = "pending_info"
    missing = state["classification"].missing_information
    log(state, f"Missing information: {missing}. Waiting for user to provide.")
    
    # Pause graph
    response = interrupt({
        "missing_information": missing,
        "email": state["email"]
    })
    
    # Resume with Command
    additional_info = response.get("additional_info", "")
    state["supplementary_info"] = additional_info
    log(state, "User provided additional info. Re-evaluating.")
    state["final_status"] = "processing"
    return state

def human_approval(state: EmailProcessingState) -> EmailProcessingState:
    state["final_status"] = "pending_approval"
    reasons = state["guardrail_result"].reasons
    log(state, f"Action requires approval: {state['recommended_action'].action_type}. Reasons: {reasons}")
    
    # Pause graph
    decision = interrupt({
        "classification": state["classification"],
        "action": state["recommended_action"],
        "guardrail_result": state["guardrail_result"]
    })
    
    if isinstance(decision, dict):
        decision_obj = HumanDecision(**decision)
    else:
        decision_obj = decision
        
    state["human_decision"] = decision_obj
    
    if decision_obj.decision == "approve":
        log(state, "Human approved.")
        state["final_status"] = "processing"
    elif decision_obj.decision == "reject":
        state["final_status"] = "rejected"
        log(state, f"Human rejected. Action will NOT be executed. Reason: {decision_obj.notes}")
    elif decision_obj.decision == "correct":
        count = state.get("correction_count", 0) + 1
        state["correction_count"] = count
        if count > MAX_CORRECTIONS:
            state["final_status"] = "manual_review"
            log(state, f"Correction limit ({MAX_CORRECTIONS}) reached. Routing to manual review.")
        else:
            state["final_status"] = "processing"
    
    return state

def route_after_human(state: EmailProcessingState) -> str:
    decision_type = state["human_decision"].decision
    if decision_type == "approve":
        return "execute_action"
    if decision_type == "reject":
        return END
    if decision_type == "correct":
        if state["correction_count"] > MAX_CORRECTIONS:
            return END
        return "store_feedback"
    return END

def store_feedback(state: EmailProcessingState) -> EmailProcessingState:
    decision = state["human_decision"]
    email = state["email"]
    classification = state["classification"]
    
    correction = HumanCorrection(
        email_subject=email.subject,
        email_body=email.body,
        original_intent=classification.intent,
        corrected_intent=decision.corrected_intent,
        notes=decision.notes or "",
        timestamp=datetime.now().isoformat()
    )
    feedback_store.save_correction(correction)
    
    # Clear stale state for full re-evaluation
    state["classification"] = None
    state["recommended_action"] = None
    state["guardrail_result"] = None
    state["approval_required"] = False
    state["missing_info_block"] = False
    
    log(state, f"Correction stored: {correction.original_intent} -> {correction.corrected_intent}. Re-evaluating.")
    return state

def execute_action(state: EmailProcessingState) -> EmailProcessingState:
    if state["final_status"] in ["error", "rejected", "manual_review"]:
        return state
        
    action = state["recommended_action"]
    log(state, f"Action executed: {action.action_type} - {action.description}")
    state["final_status"] = "executed"
    return state

def create_graph():
    builder = StateGraph(EmailProcessingState)
    
    builder.add_node("ingest_email", ingest_email)
    builder.add_node("fetch_and_classify", fetch_and_classify)
    builder.add_node("determine_action", determine_action_node)
    builder.add_node("request_info", request_info)
    builder.add_node("human_approval", human_approval)
    builder.add_node("store_feedback", store_feedback)
    builder.add_node("execute_action", execute_action)
    
    builder.add_edge(START, "ingest_email")
    builder.add_edge("ingest_email", "fetch_and_classify")
    builder.add_conditional_edges("fetch_and_classify", route_after_classify)
    builder.add_conditional_edges("determine_action", route_after_policy)
    builder.add_edge("request_info", "fetch_and_classify")
    builder.add_conditional_edges("human_approval", route_after_human)
    builder.add_edge("store_feedback", "fetch_and_classify")
    builder.add_edge("execute_action", END)
    
    return builder
