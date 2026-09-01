# Notion Press AI Author Support Hub — Architecture & System Design

This document details the architectural decisions, technology stack rationale, system design patterns, limitations, and the production roadmap for the **Notion Press AI Author Support Hub**.

---

## 1. Technology Stack Rationale

| Layer | Technology | Rationale & Trade-offs |
| :--- | :--- | :--- |
| **Orchestration & Workflow** | **LangGraph** (Python) | State-machine based orchestration designed for cyclic workflows, Human-in-the-Loop (`interrupt()` / `Command(resume=...)`), checkpoint serialization, and multi-turn state accumulation. Unlike linear chains (DAGs), LangGraph natively models iterative human feedback loops. |
| **Checkpointer & Persistence** | **SQLite Saver** (`SqliteSaver`) | Zero-configuration, file-based persistence for conversation threads and execution state snapshots. Allows any workflow to pause indefinitely while waiting for author info or human approval, surviving server restarts. |
| **Backend API** | **FastAPI** + **Uvicorn** + **SSE** | High-performance asynchronous Python web framework with native async streaming support (`StreamingResponse` for Server-Sent Events), Pydantic validation, and OpenAPI documentation out of the box. |
| **LLM Tier & Failover** | **Gemini 3.5 Flash** (Primary) + **Groq** (Instant Failover) | **Gemini 3.5 Flash** provides state-of-the-art reasoning and native JSON schema enforcement. **Groq** (`openai/gpt-oss-120b` / `llama-3.3-70b`) provides sub-second inference speeds (~500 tokens/sec) and zero-cost high-throughput fallback when Google quotas are exhausted. |
| **Frontend Framework** | **React 18** + **Vite** + **TypeScript** | Lightning-fast HMR build tooling, strong type safety matching backend Pydantic models, component-driven UI for reactive state updates and real-time SSE stream consumption via `AbortController`. |
| **Styling & Design System** | **Tailwind CSS** + Custom Design Tokens | Modern dark/light mode, sleek typography, subtle micro-animations, glassmorphism cards, and clean visual status indicators (pulsating triage badges, urgency meters, risk chips). |

---

## 2. Key Architecture & Design Decisions

```
                                  ┌─────────────────────────────────────────────────────────┐
                                  │                     CLIENT (React/TS)                   │
                                  └────────────────────────────┬────────────────────────────┘
                                                               │  SSE Stream / REST
                                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                  FASTAPI BACKEND                                                         │
│                                                                                                                           │
│   ┌────────────────────────┐         ┌─────────────────────────────────────────────────┐         ┌────────────────────┐   │
│   │   Inbound API Routes   │ ──────▶ │             LangGraph State Machine             │ ──────▶ │ SQLite Checkpointer│   │
│   └────────────────────────┘         │                                                 │         │  (Thread State DB) │   │
│                                      │  1. Ingest Email                                │         └────────────────────┘   │
│                                      │  2. Fetch Feedback & Multi-Provider Classify    │                                  │
│                                      │  3. Deterministic Policy & Guardrails           │         ┌────────────────────┐   │
│                                      │  4. HITL Approval & Info Request Interruption   │ ◀────── │   Feedback Store   │   │
│                                      │  5. Execution & Routing Action                  │         │ (corrections.json) │   │
│                                      └────────────────────────┬────────────────────────┘         └────────────────────┘   │
└───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┘
                                                                │
                                      ┌─────────────────────────┴─────────────────────────┐
                                      ▼                                                   ▼
                       ┌──────────────────────────────┐                   ┌──────────────────────────────┐
                       │  Gemini 3.5 Flash (Primary)  │ ── [Failover] ──▶ │     Groq GPT-OSS-120B        │
                       └──────────────────────────────┘                   └──────────────────────────────┘
```

### A. Zero-Wait Auto-Triage & Progressive SSE Streaming
* **Problem**: Requiring the user to manually click "Process with AI" on every email created unnecessary latency and friction.
* **Decision**: Implemented proactive streaming on email selection via `GET /api/process-stream/{email_id}` combined with client-side in-memory caching.
* **Benefit**: Support agents immediately see progressive node updates (`ingest` $\rightarrow$ `classify` $\rightarrow$ `policy` $\rightarrow$ `action`) with live animated pulsating badges. Switching back to an already triaged email renders instantly from cache with a "🔄 Re-analyze" option.

### B. Decoupled Deterministic Policy & Guardrails
* **Problem**: Pure LLM action execution is risky and unpredictable for mission-critical actions (e.g., refunds, database metadata changes, escalations).
* **Decision**: The LLM *only* performs intent classification, entity extraction, and missing information identification. Business decisions and risk assessments are evaluated by a **deterministic Python policy engine** (`backend/app/policy.py`):
  * **Urgency $\ge 4$**: Automatically triggers `human_approval`.
  * **Confidence $< 70\%$**: Automatically triggers `human_approval`.
  * **High-Impact Actions** (`issue_refund`, `modify_metadata`, `escalate`): Always require human supervisor sign-off.
  * **Missing Required Identifiers**: Halts routing and triggers `request_info`.

### C. Multi-Provider Automatic Failover
* **Problem**: Free-tier cloud LLM endpoints frequently suffer from rate limits (`429 RESOURCE_EXHAUSTED`) or network timeouts.
* **Decision**: Implemented resilient multi-provider routing in `backend/app/graph.py`:
  * Attempts primary model (`Gemini 3.5 Flash`) with `max_retries=0` for instant failure detection.
  * Catches exceptions immediately and switches to `Groq` (`openai/gpt-oss-120b`) in under 2.5 seconds without crashing the user session.
  * Both providers adhere to the identical `EmailClassification` Pydantic structured output contract.

### D. In-Context Feedback Loop (Few-Shot Reinforcement)
* **Problem**: Fine-tuning or retraining weights on every single human correction is expensive, slow, and operationally impractical for day-to-day support triage.
* **Decision**: Implemented **In-Context Reinforcement Learning (Few-Shot Dynamic Memory)**:
  * When a human supervisor overrides an intent (e.g., `isbn_metadata` $\rightarrow$ `printing_issue`), the correction and domain explanation are persisted to `data/corrections.json`.
  * On future runs, `feedback_store.get_relevant_corrections()` injects relevant past corrections directly into the system prompt.
  * The model immediately adapts to domain-specific business rules without model retraining.

### E. Multi-Turn State Accumulation & File Attachment Context
* **Problem**: In multi-turn HITL flows, successive user inputs could overwrite previous information or omit uploaded defect images.
* **Decision**: State accumulation logic concatenates successive supplementary inputs (`f"{existing}\n{new}"`) and explicitly injects filenames from `state["attachments"]` into the LLM context string.

---

## 3. Current POC Limitations

1. **Local File Persistence**:
   * SQLite checkpoints and the JSON feedback store run on the local filesystem. This is ideal for single-instance POCs and evaluation but does not scale horizontally across multiple container replicas.
2. **Simulated Email Inbox**:
   * Incoming emails and author replies are currently simulated via a curated mock dataset (`sample_emails.py`) and an interactive UI form rather than live IMAP/SMTP/Webhook listeners.
3. **Lexical Few-Shot Retrieval**:
   * Corrections are currently retrieved using category matching and recency filters. In a large enterprise with thousands of corrections, dense vector embeddings would provide higher semantic precision.
4. **Local Proof Storage**:
   * Uploaded defect images/videos are handled in-memory and referenced by filename rather than uploaded to a secure cloud blob storage bucket.

---

## 4. Production Roadmap & Improvements

```
+----------------------------------------------------------------------------------------------------+
|                                    ENTERPRISE ARCHITECTURE ROADMAP                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [Email Gateways] ──▶ [Event Bus / Kafka] ──▶ [Distributed Workers] ──▶ [PostgreSQL Checkpointer]  |
|  (SendGrid/SES/Gmail)   (Pub/Sub Queue)       (FastAPI + Celery)        (AsyncPostgresSaver)       |
|                                                       │                                            |
|                                                       ▼                                            |
|                                            [Qdrant / pgvector]                                     |
|                                            (Semantic Few-Shot Memory)                              |
+----------------------------------------------------------------------------------------------------+
```

### 1. Production Database & Distributed Checkpointing
* Replace `SqliteSaver` with **`AsyncPostgresSaver`** backed by a managed PostgreSQL instance (e.g., AWS RDS / Supabase).
* Enables horizontal scaling of API workers, connection pooling, and multi-region resilience.

### 2. Live Inbound Email Webhook Pipeline
* Integrate with **SendGrid Inbound Parse**, **AWS SES**, or **Gmail Pub/Sub API**.
* When an author sends an email or replies to a missing info request, webhooks automatically route the payload into the LangGraph thread via Celery background tasks.

### 3. Vector-Based Semantic Memory (pgvector / Qdrant)
* Convert the JSON feedback store into a **Vector Database** using dense embeddings (`text-embedding-004`).
* Perform cosine similarity searches to retrieve the top-3 most semantically similar historical corrections for any incoming email, improving classification accuracy on rare edge cases.

### 4. Cloud Object Storage for Proof Attachments
* Direct-to-S3 pre-signed upload URLs for defect photos and videos.
* Integration with **Google Cloud Vision API** / Multimodal LLMs to automatically verify whether attached photos contain actual page smudges or broken bindings before routing to human QA.

### 5. Role-Based Access Control (RBAC) & Audit Logs
* Multi-tenant role segregation:
  * **Tier 1 Support Agent**: View emails, submit missing info, request clarification.
  * **Senior Support / Lead**: Approve refunds, modify metadata, submit AI corrections.
* Immutable audit trails recording every LLM token count, latency metric, human approval, and override timestamp for compliance.

### 6. Production Observability & Tracing
* Connect **LangSmith** / **OpenTelemetry** for full end-to-end tracing of LLM latencies, prompt token costs, fallback frequencies, and error rates across all customer support threads.
