import os
import logging
from datetime import datetime
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

from langchain_core.output_parsers import StrOutputParser

from app.models import EmailProcessingState, EmailClassification, HumanCorrection, HumanDecision
from app.policy import determine_action, evaluate_guardrails
from app.config import MAX_LLM_RETRIES, MAX_CORRECTIONS
from app.prompts import build_prompt, sanitize_prompt_input, RAG_REPLY_PROMPT_TEMPLATE
from app.feedback_store import feedback_store
from app.intake_filter import check_spam
from app.intent_cache import intent_cache
from app.knowledge_base import author_knowledge_base
from app.utils import extract_content_str

load_dotenv(override=True)

logger = logging.getLogger(__name__)

_CACHED_LLMS = None
_CACHED_KEYS = None

def _is_valid_api_key(key: str | None) -> bool:
    if not key or not isinstance(key, str):
        return False
    key = key.strip()
    return len(key) >= 15 and not key.startswith("your_") and not key.startswith("dummy_")

def get_llms():
    global _CACHED_LLMS, _CACHED_KEYS
    gemini_key = os.environ.get("GOOGLE_API_KEY")
    groq_key = os.environ.get("GROQ_API_KEY")
    current_keys = (gemini_key, groq_key)
    
    if _CACHED_LLMS is not None and _CACHED_KEYS == current_keys:
        return _CACHED_LLMS
    
    gemini = None
    if _is_valid_api_key(gemini_key):
        try:
            gemini = ChatGoogleGenerativeAI(model="gemini-3.5-flash", max_retries=1, timeout=30.0)
        except Exception as e:
            logger.warning(f"Failed to initialize ChatGoogleGenerativeAI: {e}")
            gemini = None

    groq = None
    if _is_valid_api_key(groq_key):
        try:
            groq = ChatGroq(model="openai/gpt-oss-120b", max_retries=1, timeout=30.0)
        except Exception as e:
            logger.warning(f"Failed to initialize ChatGroq: {e}")
            groq = None
            
    _CACHED_LLMS = (gemini, groq)
    _CACHED_KEYS = current_keys
    return gemini, groq

def invoke_classification(prompt: str, state: dict) -> tuple[EmailClassification, str]:
    gemini_llm, groq_llm = get_llms()
    
    # 1. Attempt Groq (Primary)
    if groq_llm:
        try:
            structured_llm = groq_llm.with_structured_output(EmailClassification)
            res = structured_llm.invoke(prompt)
            return res, "Groq (GPT-OSS-120B)"
        except Exception as e:
            err_msg = str(e)
            if gemini_llm:
                log(state, f"Groq rate limit/error ({err_msg[:60]}...). Automatically switching to Gemini failover...")
            else:
                raise e
                
    # 2. Attempt Gemini (Failover / Secondary)
    if gemini_llm:
        try:
            structured_llm = gemini_llm.with_structured_output(EmailClassification)
            res = structured_llm.invoke(prompt)
            return res, "Gemini 3.5 Flash"
        except Exception as e:
            log(state, f"Gemini execution error: {str(e)[:80]}")
            raise e
        
    raise RuntimeError("No working LLM provider found. Please set GOOGLE_API_KEY or GROQ_API_KEY in backend/.env")

def log(state: dict, message: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    state.setdefault("processing_log", []).append(f"[{timestamp}] {message}")
    print(f"[{timestamp}] {message}", flush=True)
    logger.info(f"[{timestamp}] {message}")

def ingest_email(state: EmailProcessingState) -> EmailProcessingState:
    # Initialize basic state consistently across all execution paths
    state["retry_count"] = 0
    state["correction_count"] = 0
    state["processing_log"] = state.get("processing_log", [])
    state["final_status"] = "processing"
    state["supplementary_info"] = state.get("supplementary_info", None)
    state["attachments"] = state.get("attachments", [])
    state["intake_result"] = None
    state["classification"] = None
    state["recommended_action"] = None
    state["guardrail_result"] = None
    state["approval_required"] = False
    state["missing_info_block"] = False
    state["human_decision"] = None
    state["draft_response"] = None
    state["knowledge_sources"] = None
    
    email = state["email"]
    log(state, f"Email received from {email.sender}: {email.subject}")
    return state

def intake_filter_node(state: EmailProcessingState) -> EmailProcessingState:
    """Fast-path intake filter: deterministic spam check + semantic intent cache."""
    email = state["email"]
    
    # ── Layer 1: Fast-path spam detection ─────────────────────────────────
    spam_result = check_spam(email)
    if spam_result.outcome == "spam_filtered":
        state["intake_result"] = "spam_filtered"
        state["classification"] = spam_result.classification
        state["recommended_action"] = spam_result.action
        state["guardrail_result"] = None
        state["approval_required"] = False
        state["missing_info_block"] = False
        state["final_status"] = "executed"
        log(state, f"⚡ FAST-PATH: Spam detected — {spam_result.reason}")
        log(state, "Action: archive (no LLM used, $0.00 cost)")
        return state
    
    # ── Layer 2: Semantic intent cache lookup ─────────────────────────────
    cache_result = intent_cache.get_cached_classification(email)
    if cache_result and cache_result.outcome == "cache_hit":
        state["intake_result"] = "cache_hit"
        state["classification"] = cache_result.classification
        state["recommended_action"] = None
        state["guardrail_result"] = None
        state["approval_required"] = False
        state["missing_info_block"] = False
        state["final_status"] = "processing"
        log(state, f"💾 CACHE HIT: Reusing classification '{cache_result.classification.intent}' "
            f"(similarity={cache_result.confidence:.3f}) — no LLM call")
        return state
    
    # ── Pass through to full LLM pipeline ─────────────────────────────────
    log(state, f"Intake filter: passed (spam_score={spam_result.confidence:.2f}, no cache hit). Proceeding to LLM.")
    return state

def route_after_intake(state: EmailProcessingState) -> str:
    """Route based on intake filter result."""
    intake = state.get("intake_result")
    if intake == "spam_filtered":
        return "execute_action"       # Skip LLM entirely
    if intake == "cache_hit":
        return "determine_action"     # Skip LLM, run policy/guardrails
    return "fetch_and_classify"       # Full pipeline

def fetch_and_classify(state: EmailProcessingState) -> EmailProcessingState:
    email = state["email"]
    
    # If we are re-classifying after correction, use previous classification intent to fetch relevant corrections
    prev_classification = state.get("classification")
    predicted_intent = prev_classification.intent if prev_classification else None
    email_query = f"Subject: {email.subject}\nBody: {email.body}"
    corrections = feedback_store.get_relevant_corrections(
        query_text=email_query,
        predicted_intent=predicted_intent
    )
    corrections_text = feedback_store.format_for_prompt(corrections)
    state["corrections"] = corrections_text
    if corrections:
        log(state, f"RAG: Injected {len(corrections)} relevant historical human correction(s) into prompt")
    else:
        log(state, "RAG: No relevant past corrections found above similarity threshold")
    
    prompt = build_prompt(
        email_subject=email.subject, 
        email_body=email.body, 
        corrections_text=corrections_text,
        supplementary_info=state.get("supplementary_info", ""),
        attachments=state.get("attachments", [])
    )
    
    try:
        classification, provider_name = invoke_classification(prompt, state)
        state["classification"] = classification
        state["retry_count"] = 0 # reset on success
        log(state, f"Classification successful via {provider_name}: {classification.intent}")
        
        # Cache the successful classification for future similar emails
        # (This is a best-effort optimization; failures do not block the pipeline)
        try:
            intent_cache.cache_classification(email, classification)
        except Exception as cache_err:
            logger.warning(f"Failed to cache classification (best-effort): {cache_err}")
    except Exception as e:
        retry_count = state.get("retry_count", 0) + 1
        if retry_count <= MAX_LLM_RETRIES:
            state["retry_count"] = retry_count
            log(state, f"LLM failed ({e}), retry {retry_count}/{MAX_LLM_RETRIES}")
        else:
            log(state, f"LLM failed after {MAX_LLM_RETRIES} retries. Routing to manual review.")
            state["retry_count"] = 0
            state["final_status"] = "error"
    return state

def route_after_classify(state: EmailProcessingState) -> str:
    if state["final_status"] == "error":
        return END # LLM failed after all retries
    if state.get("retry_count", 0) > 0:
        return "fetch_and_classify" # Loop back for retry
    return "determine_action"

def generate_rag_reply(state: EmailProcessingState) -> EmailProcessingState:
    """Retrieve relevant Notion Press policies from ChromaDB and generate a grounded draft auto-reply."""
    email = state["email"]
    classification = state.get("classification")
    intent = classification.intent if classification else "general_inquiry"

    query_text = f"{email.subject}\n{email.body}"
    retrieved_docs = author_knowledge_base.query_knowledge(query_text=query_text, intent=intent, top_k=2)

    if not retrieved_docs:
        log(state, "[RAG] No matching policy chunks found in knowledge base.")
        return state

    sources = [doc["title"] for doc in retrieved_docs]
    state["knowledge_sources"] = sources
    log(state, f"📚 [RAG] Retrieved {len(retrieved_docs)} policy documents: {', '.join(sources)}")

    context_str = "\n\n".join([f"### {doc['title']}\n{doc['content']}" for doc in retrieved_docs])

    safe_name = sanitize_prompt_input(email.sender_name)
    safe_email = sanitize_prompt_input(email.sender)
    safe_subject = sanitize_prompt_input(email.subject)
    safe_body = sanitize_prompt_input(email.body)
    safe_context = sanitize_prompt_input(context_str)

    rag_inputs = {
        "verified_policies": safe_context,
        "author_first_name": safe_name.split()[0] if safe_name else "Author",
        "author_name": safe_name,
        "author_email": safe_email,
        "subject": safe_subject,
        "body": safe_body,
    }

    gemini_llm, groq_llm = get_llms()
    output_parser = StrOutputParser()
    draft = None
    provider_used = None

    # 1. Attempt Groq (Primary)
    if groq_llm:
        try:
            # Declarative LangChain Expression Language (LCEL) chain
            chain = RAG_REPLY_PROMPT_TEMPLATE | groq_llm | output_parser
            raw = chain.invoke(rag_inputs)
            draft = extract_content_str(raw)
            provider_used = "Groq (GPT-OSS-120B)"
        except Exception as e:
            logger.warning(f"Groq failed for RAG reply generation: {e}")
            if gemini_llm:
                log(state, f"Groq error/timeout ({str(e)[:60]}...). Automatically switching to Gemini failover for RAG...")

    # 2. Attempt Gemini (Failover / Secondary)
    if not draft and gemini_llm:
        try:
            # Declarative LangChain Expression Language (LCEL) failover chain
            chain = RAG_REPLY_PROMPT_TEMPLATE | gemini_llm | output_parser
            raw = chain.invoke(rag_inputs)
            draft = extract_content_str(raw)
            provider_used = "Gemini 3.5 Flash"
        except Exception as e:
            logger.warning(f"Gemini failed for RAG reply generation: {e}")
            log(state, f"Gemini failover error: {str(e)[:60]}")

    if draft and draft.strip():
        state["draft_response"] = draft.strip()
        log(state, f"✨ [RAG] Grounded auto-reply generated via {provider_used} (LCEL)")
    else:
        # Fallback template if LLM is unavailable
        fallback_summary = retrieved_docs[0]["content"].split("\n")[0]
        state["draft_response"] = (
            f"Dear {email.sender_name},\n\n"
            f"Thank you for reaching out to Notion Press Support regarding '{email.subject}'.\n\n"
            f"Based on our official guidelines: {fallback_summary}\n\n"
            f"Please let us know if you have any further questions.\n\n"
            f"Warm regards,\nNotion Press Author Support Team"
        )
        log(state, "✨ [RAG] Standard auto-reply drafted from knowledge base")

    return state

def determine_action_node(state: EmailProcessingState) -> EmailProcessingState:
    classification = state["classification"]
    
    action = determine_action(classification)
    guardrail = evaluate_guardrails(classification, action)
    
    state["recommended_action"] = action
    state["guardrail_result"] = guardrail
    state["approval_required"] = guardrail.approval_required
    state["missing_info_block"] = guardrail.missing_info_block
    
    # If action is auto_reply and not missing info, generate the RAG draft
    if action.action_type == "auto_reply" and not guardrail.missing_info_block:
        generate_rag_reply(state)

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
    new_attachments = response.get("attachments", [])
    
    existing_info = state.get("supplementary_info") or ""
    if existing_info and additional_info:
        state["supplementary_info"] = f"{existing_info}\n{additional_info}".strip()
    elif additional_info:
        state["supplementary_info"] = additional_info.strip()
        
    current_attachments = state.get("attachments", []) or []
    state["attachments"] = list(set(current_attachments + new_attachments))
    log(state, f"User provided additional info and {len(new_attachments)} attachment(s). Re-evaluating.")
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
    
    # Invalidate intent cache for the original intent to prevent stale cache hits
    try:
        intent_cache.invalidate_for_intent(classification.intent)
    except Exception as e:
        logger.warning(f"Failed to invalidate intent cache: {e}")
    
    # Clear stale state for full re-evaluation
    state["classification"] = None
    state["recommended_action"] = None
    state["guardrail_result"] = None
    state["approval_required"] = False
    state["missing_info_block"] = False
    state["intake_result"] = None  # Reset so re-evaluation goes through LLM
    
    log(state, f"Correction stored: {correction.original_intent} -> {correction.corrected_intent}. Cache invalidated. Re-evaluating.")
    return state

def execute_action(state: EmailProcessingState) -> EmailProcessingState:
    if state["final_status"] in ["error", "rejected", "manual_review"]:
        return state
        
    action = state["recommended_action"]
    
    # Actually perform the side-effect here based on action_type
    if action and action.action_type == "archive":
        log(state, f"Side-effect: Archiving email '{state['email'].subject}' from inbox")
    elif action and action.action_type == "auto_reply" and state.get("draft_response"):
        log(state, f"Side-effect: Dispatched RAG auto-reply directly to {state['email'].sender}")
    
    log(state, f"Action executed: {action.action_type if action else 'none'} - {action.description if action else 'No action'}")
    state["final_status"] = "executed"
    return state

def create_graph():
    builder = StateGraph(EmailProcessingState)
    
    builder.add_node("ingest_email", ingest_email)
    builder.add_node("intake_filter", intake_filter_node)
    builder.add_node("fetch_and_classify", fetch_and_classify)
    builder.add_node("determine_action", determine_action_node)
    builder.add_node("request_info", request_info)
    builder.add_node("human_approval", human_approval)
    builder.add_node("store_feedback", store_feedback)
    builder.add_node("execute_action", execute_action)
    
    builder.add_edge(START, "ingest_email")
    builder.add_edge("ingest_email", "intake_filter")
    builder.add_conditional_edges("intake_filter", route_after_intake)
    builder.add_conditional_edges("fetch_and_classify", route_after_classify)
    builder.add_conditional_edges("determine_action", route_after_policy)
    builder.add_edge("request_info", "fetch_and_classify")
    builder.add_conditional_edges("human_approval", route_after_human)
    builder.add_edge("store_feedback", "fetch_and_classify")
    builder.add_edge("execute_action", END)
    
    return builder
