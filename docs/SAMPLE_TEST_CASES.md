# Sample Test Cases & Evaluation Scenarios

**AI-Powered Email Processing System - Notion Press Proof of Concept**  

This document provides the complete suite of **Sample Test Cases** used to evaluate the system’s accuracy, anti-hallucination guardrails, human-in-the-loop workflows, and feedback learning loops.

 *

## 🎯 Test Cases vs. Assessment Requirements Mapping

| Test Case | Scenario / Author | Target Assessment Requirement | Expected Outcome |
| --- | --- | --- | --- |
| **TC-01** | **Rahul Menon** (#2) | Policy Grounding & RAG Auto-Reply | Grounded reply quoting verified Amazon 48–72h SLA without hallucination. |
| **TC-02** | **Anita Desai** (#3) | Missing Information & Anti-Hallucination | Pauses via LangGraph `interrupt()`; requests Order ID & photo proof. |
| **TC-03** | **Karthik S.** (#6) | High-Impact Action & Guardrails | Urgency 4/5 + ISBN error triggers mandatory supervisor approval gate. |
| **TC-04** | **Angry Author** (#8) | Extreme Urgency & Escalation | Urgency 5/5 automatically overrides LLM to trigger `escalate` with supervisor sign-off. |
| **TC-05** | **Priya Sharma** (#1) | Safe Departmental Routing (Finance) | Classifies `royalty_inquiry` and routes directly to Finance Team. |
| **TC-06** | **Vikram Seth** (#4) | Pre-Publication Asset Update (Design) | Classifies `cover_design` and routes directly to Cover Design Team. |
| **TC-07** | **Meera Nair** (#5) | Distribution Channel Sync Delay | Grounded RAG auto-reply explaining Flipkart 7–14 business day sync timelines. |
| **TC-08** | **Newcomer Author** (#7) | Publishing Onboarding Guidance | Grounded RAG auto-reply detailing the 3-step Notion Press self-publishing path. |
| **TC-09** | **SpamBot Inc** (#9) | Fast-Path Intake Filter (<span class=“va-math-inline” data-latex="0 Cost) | Quarantined in ~1ms without LLM invocation (" contenteditable=“false”>0Cost)∣Quarantinedin 1mswithoutLLMinvocation(0 token cost). |
| **TC-10** | **Deepa Krishnan** (#10) | Multi-Intent Discrepancy & Routing | Deconstructs compound inquiry (royalty + inventory) into prioritized action. |
| **TC-11** | **Human Feedback Loop** | In-Context Dynamic Few-Shot Learning | Correction stored in ChromaDB vector store; reuses exemplar for future queries. |

 *

## 📋 Detailed Test Case Specifications

### Test Case 1: Grounded Policy RAG Auto-Reply (Zero Hallucination)

*   **Email ID**: `2`
*   **Sender**: `Rahul Menon <rahul.menon@example.com>`
*   **Subject**: `When will my book go live?`
*   **Raw Body**:
    
    > *“Hello, I approved the final proof two days ago. When will my book be available for purchase on Amazon?”*
    
*   **What This Tests**:
    *   Accurate intent classification (`publishing_status`).
    *   Document grounding via ChromaDB vector retrieval against the official Notion Press Author Publishing Policy Handbook.
    *   Ensures the model quotes verified platform turnaround times (48–72 hours for Amazon) rather than fabricating dates.
*   **Expected Result**:
    *   **Intent**: `publishing_status` | **Urgency**: `1 / 5` | **Confidence**: `> 90%`
    *   **Recommended Action**: `auto_reply`
    *   **Requires Human Approval**: `False` (safe, informational query)
    *   **Draft Content**: Friendly, policy-grounded draft quoting official distribution SLAs.

 *

### Test Case 2: Missing Information & Anti-Hallucination Halt

*   **Email ID**: `3`
*   **Sender**: `Anita Desai <anita.desai@example.com>`
*   **Subject**: `URGENT: Pages smudged in my book`
*   **Raw Body**:
    
    > *“I just received my author copies and the printing quality is terrible! Pages 45-50 are completely smudged and unreadable. This is unacceptable.”*
    
*   **What This Tests**:
    *   **Anti-Hallucination Constraint**: The author did not provide an Order Number, Print Batch ID, or defective page photo.
    *   The system must **not** invent an order ID or promise a free reprint blindly.
    *   Halts workflow using LangGraph `interrupt()` to request missing critical details.
*   **Expected Result**:
    *   **Intent**: `printing_issue` | **Urgency**: `3 / 5`
    *   **Missing Info Flag**: `['order_id', 'photo_proof', 'affected_quantity']`
    *   **Recommended Action**: `request_info`
    *   **Workflow State**: Pauses at `need_more_info` waiting for author input.

 *

### Test Case 3: High-Impact Guardrails & Mandatory Supervisor Approval

*   **Email ID**: `6`
*   **Sender**: `Karthik Subramanian <karthik.s@example.com>`
*   **Subject**: `Wrong ISBN on my published book!!`
*   **Raw Body**:
    
    > *“I am shocked to see that the ISBN printed on my physical book does not match the one registered. Please fix this immediately, this is a major error.”*
    
*   **What This Tests**:
    *   Deterministic safety guardrail (`policy.py`): Metadata/ISBN changes and printing corrections carry legal and financial repercussions.
    *   System overrides automatic dispatch and mandates human supervisor sign-off.
*   **Expected Result**:
    *   **Intent**: `isbn_metadata` | **Urgency**: `4 / 5`
    *   **Deterministic Policy Trigger**: `Urgency >= 4` OR `Action == modify_metadata`
    *   **Requires Human Approval**: `True` (Mandatory)
    *   **Workflow State**: Pauses at `human_approval` modal; cannot execute without explicit supervisor authorization.

 *

### Test Case 4: Extreme Urgency & Escalation

*   **Email ID**: `8`
*   **Sender**: `Angry Author <angry.author@example.com>`
*   **Subject**: `I've waited 3 months, unacceptable!`
*   **Raw Body**:
    
    > *“I have been waiting for 3 months and there is still no resolution. I demand to speak to a manager right now!”*
    
*   **What This Tests**:
    *   Sentiment analysis & high-urgency detection.
    *   Escalation handling for prolonged unresolved disputes.
*   **Expected Result**:
    *   **Intent**: `complaint` | **Urgency**: `5 / 5` (Maximum)
    *   **Recommended Action**: `escalate` (routed to Senior Operations Manager)
    *   **Requires Human Approval**: `True` (Urgency 5 always requires manager notification)

 *

### Test Case 5: Safe Departmental Routing (Finance / Royalty)

*   **Email ID**: `1`
*   **Sender**: `Priya Sharma <priya.sharma@example.com>`
*   **Subject**: `Royalties not credited for June`
*   **Raw Body**:
    
    > *“Hi team, I haven’t received my royalty payout for the month of June. It was supposed to be credited by the 5th. Can you please check?”*
    
*   **What This Tests**:
    *   Department routing without unnecessary human interruption for routine inquiries.
    *   Routes directly to Finance queue with extracted period (`June`).
*   **Expected Result**:
    *   **Intent**: `royalty_inquiry` | **Urgency**: `2 / 5`
    *   **Recommended Action**: `route_to_team` (`Finance Department`)
    *   **Requires Human Approval**: `False`

 *

### Test Case 6: Cover Design Update Routing

*   **Email ID**: `4`
*   **Sender**: `Vikram Seth <vikram.seth@example.com>`
*   **Subject**: `Need to change my book cover`
*   **Raw Body**:
    
    > *“Hi, I have a new cover design for my upcoming book. Can you please update the file before it goes to print?”*
    
*   **What This Tests**:
    *   Distinguishes pre-print asset updates from post-publication metadata changes.
    *   Routes to Design & Layout team.
*   **Expected Result**:
    *   **Intent**: `cover_design` | **Urgency**: `2 / 5`
    *   **Recommended Action**: `route_to_team` (`Design & Formatting Team`)

 *

### Test Case 7: Distribution Channel Timeline Inquiry

*   **Email ID**: `5`
*   **Sender**: `Meera Nair <meera.nair@example.com>`
*   **Subject**: `Book not showing on Flipkart`
*   **Raw Body**:
    
    > *“My book has been live on your store for a week, but I still can’t find it on Flipkart. Is there a delay in distribution?”*
    
*   **What This Tests**:
    *   Multi-channel retail policy awareness.
    *   Cites Flipkart-specific indexing windows (7–14 business days).
*   **Expected Result**:
    *   **Intent**: `distribution` | **Urgency**: `2 / 5`
    *   **Recommended Action**: `auto_reply` (grounded policy explanation)

 *

### Test Case 8: New Author Onboarding Guidance

*   **Email ID**: `7`
*   **Sender**: `Newcomer Author <new.author@example.com>`
*   **Subject**: `How do I start self-publishing?`
*   **Raw Body**:
    
    > *“Hi Notion Press, I have a manuscript ready and I want to self-publish. What are the steps to get started?”*
    
*   **What This Tests**:
    *   Helpful, structured onboarding response for prospective authors.
*   **Expected Result**:
    *   **Intent**: `general_inquiry` | **Urgency**: `1 / 5`
    *   **Recommended Action**: `auto_reply` (provides 3-step publishing overview)

 *

### Test Case 9: Fast-Path Spam Quarantine ($0 Cost)

*   **Email ID**: `9`
*   **Sender**: `SpamBot Inc <spambot@spamservices.com>`
*   **Subject**: `Boost your book sales with SEO!`
*   **Raw Body**:
    
    > *“Want to be a bestseller? Buy our guaranteed SEO services for just $99. Click here to increase your rankings.”*
    
*   **What This Tests**:
    *   Fast-path deterministic intake filter (`intake_filter.py`).
    *   Quarantined in < 2ms without invoking LLM tokens.
*   **Expected Result**:
    *   **Spam Score**: `1.0` (Heuristic match on commercial solicitation)
    *   **Action**: Instantly quarantined / archived.
    *   **Token Cost**: `$0.00`

 *

### Test Case 10: Multi-Intent Compound Inquiry

*   **Email ID**: `10`
*   **Sender**: `Deepa Krishnan <deepa.k@example.com>`
*   **Subject**: `Royalties wrong + book not on Amazon`
*   **Raw Body**:
    
    > *“My royalty report for last month seems incorrect, and on top of that, my book is out of stock on Amazon. What is going on?”*
    
*   **What This Tests**:
    *   Extracts compound author issues (Finance + Distribution).
    *   Prioritizes primary blocker while maintaining context of secondary issue.
*   **Expected Result**:
    *   **Primary Intent**: `royalty_inquiry` | **Secondary Entity**: `Amazon stock availability`
    *   **Urgency**: `3 / 5`

 *

## 🔄 Test Case 11: Human Feedback & Learning Loop Verification

This test demonstrates the core assessment requirement: *“Add a simple way for a human to correct an AI decision and show how that correction can help with similar emails in the future.”*

### Step-by-step verification:

1. Open the Live Demo: https://notion-press-poc.vercel.app/
2. Select Email #4 (Vikram Seth) or any other inquiry.
3. Click the “Provide Correction” button in the top action bar.
4. Change the Intent (e.g. from cover_design to general_inquiry) and add a brief reason (e.g., “Author is asking general process questions”).
5. Click “Submit Correction & Re-evaluate”.
6. Observation:The correction is immediately indexed into the persistent ChromaDB vector store (feedback_store.py).The workflow re-evaluates the email through the state machine.When a similar inquiry arrives in the future, the system dynamically retrieves this exemplar via cosine similarity, improving classification accuracy without model fine-tuning.

 *

## 🧪 Automated Unit Test Cases (74 Tests, 100% Passing)

For automated programmatic evaluation, the backend test suite executes 74 regression unit tests covering all safety and routing invariants:

```bash
cd backend
uv run pytest
```

| Test Suite | File | Tests | Focus Areas |
| --- | --- | --- | --- |
| **Workflow Routing** | `tests/test_graph.py` | 10 | LangGraph state transitions, conditional branching, interrupts. |
| **Feedback Learning** | `tests/test_feedback_store.py` | 7 | ChromaDB vector exemplar insertion, cosine retrieval, JSON fallback. |
| **Intake Triage** | `tests/test_intake_filter.py` | 15 | Heuristic spam detection, fast-path archiving, token cost limits. |
| **Intent Caching** | `tests/test_intent_cache.py` | 9 | Cosine similarity semantic caching (0.90 threshold). |
| **Policy RAG KB** | `tests/test_knowledge_base.py` | 7 | PDF extraction, chunking, dynamic ChromaDB indexing & auto-seeding. |
| **API Endpoints** | `tests/test_main.py` | 9 | REST endpoints, SSE streaming (`/api/process-stream`), CORS. |
| **Security & Safety** | `tests/test_security.py` | 17 | Prompt injection defense, delimiter isolation, rate limiting. |
| **Total** | **7 Suites** | **74** | **100% Pass Rate** |