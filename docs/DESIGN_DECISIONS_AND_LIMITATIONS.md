# Design Decisions, Limitations, and Production Roadmap

**AI-Powered Email Processing System — Notion Press Proof of Concept**  
*Junior Engineer Assessment Submission Document (September 6, 2026)*

---

## Executive Summary

This document provides a comprehensive analysis of the architectural design decisions, system invariants, current proof-of-concept (POC) limitations, and the production upgrade roadmap for the **Notion Press AI-Powered Email Processing System**.

```mermaid
flowchart TD
    subgraph Client ["Frontend (React 18 + TypeScript + Vite)"]
        UI["Mock Inbox UI / Live Triage"]
        HITL_UI["HITL Modals (Missing Info & Supervisor Approval)"]
    end

    subgraph Backend ["FastAPI Backend"]
        API["REST & SSE Streaming API"]

        subgraph LangGraph ["LangGraph State Machine (thread_id)"]
            N1["1. Ingest Email"]
            N2["2. Intake Filter (Deterministic Spam & Intent Cache)"]
            N3["3. Fetch Corrections & Classify"]
            N4["4. Determine Action & Policy Guardrails"]
            N5["5. Missing Info Interrupt (interrupt & resume)"]
            N6["6. Supervisor Approval Interrupt (Approve / Reject / Correct)"]
            N7["7. Store Feedback (ChromaDB + JSON)"]
            N8["8. Execute Action / Auto-Reply"]
        end

        subgraph Storage ["Persistence & Vector Retrieval"]
            SQLite[("SQLite Saver: checkpoints.db")]
            FeedbackDB[("Feedback Store: ChromaDB + JSON")]
            PolicyKB[("Knowledge Base: ChromaDB Policies")]
        end

        subgraph LLMTier ["Multi-Provider LLM Tier"]
            Groq["Groq GPT-OSS-120B (Primary · ~500 tok/sec)"]
            Gemini["Gemini 3.5 Flash (Secondary Failover)"]
            Groq -.->|Failover| Gemini
        end

        PolicyEngine["Deterministic Policy Engine (Pure Python Rules · $0 Token Cost)"]
    end

    %% Client flows
    UI -->|GET /api/emails / SSE /api/process-stream| API
    API --> N1
    N1 --> N2

    %% Fast path bypass
    N2 -->|Spam Filtered ($0)| N8
    N2 -->|Cache Hit ($0)| N4
    N2 -->|Pass Through| N3

    %% LLM & RAG calls
    FeedbackDB -->|Dynamic Few-Shot Exemplars| N3
    N3 <-->|Structured Output| LLMTier
    N3 --> N4

    %% Policy evaluation
    N4 <-->|Evaluate Guardrails| PolicyEngine
    PolicyKB -->|Retrieve Policy Docs| N4
    N4 -.->|LCEL Grounded Reply| LLMTier

    %% Branching & HITL
    N4 -->|Missing Identifiers| N5
    N4 -->|High Impact / Urgency >= 4| N6
    N4 -->|Safe to Route| N8

    %% Resumption
    N5 <-->|Command(resume)| HITL_UI
    N5 -->|Accumulated Info| N3

    N6 <-->|Command(resume)| HITL_UI
    N6 -->|Approve| N8
    N6 -->|Reject| EndTerm["END (Rejection Invariant)"]
    N6 -->|Correct Intent| N7
    N7 -->|Invalidate Cache & Re-evaluate| N3

    N8 --> EndSuccess["END (Action Executed)"]

    %% Checkpointing
    LangGraph <--> SQLite
```

---

## 1. Key Architectural Design Decisions

### 1.1 Why LangGraph over Multi-Agent Swarms or Linear Chains
* **Decision**: We adopted **LangGraph** (`StateGraph`) as the core orchestration framework instead of multi-agent swarms (e.g., CrewAI, AutoGen) or linear DAG chains (e.g., standard LangChain chains).
* **Rationale**:
  - **Single AI Decision Node**: Support email triage requires deterministic workflow reliability. An unconstrained multi-agent swarm introduces non-deterministic latency, runaway token loops, and cascading errors.
  - **First-Class Human-in-the-Loop (HITL)**: LangGraph provides native `interrupt()` and `Command(resume=...)` primitives, enabling execution to pause indefinitely while waiting for author clarification or supervisor approval.
  - **Thread Checkpointing**: Conversation threads survive server restarts through state serialization.
  - **Cyclic Graphs**: Linear DAGs cannot easily model retry loops or supervisor correction feedback cycles; LangGraph handles state cycles natively.

---

### 1.2 Decoupled Deterministic Policy & Guardrails Engine
* **Decision**: The LLM is strictly constrained to **understanding and entity extraction** (`intent`, `urgency`, `entities`, `missing_information`). It does **not** execute actions or make business policy decisions directly.
* **Rationale**:
  - Pure LLM action selection is vulnerable to prompt injections, hallucinated permissions, and subtle policy drifting.
  - Business rules are enforced by standard Python code in `backend/app/policy.py`:
    1. **High-Impact Actions** (`issue_refund`, `modify_metadata`, `escalate`) **always** require human supervisor sign-off.
    2. **High Urgency** (>= 4/5) automatically triggers supervisor approval.
    3. **Low Confidence** (< 70%) routes to human review.
    4. **Missing Information** automatically halts execution and routes to author clarification.

---

### 1.3 Multi-Provider Resilient Failover (Groq Primary + Gemini Fallback)
* **Decision**: Configured **Groq (`openai/gpt-oss-120b`)** as the primary inference engine with seamless automatic failover to **Google Gemini 3.5 Flash**.
* **Rationale**:
  - **Speed**: Groq delivers ~500 tokens/second, enabling near-instant email triage (~400ms latency).
  - **Availability**: Free-tier cloud endpoints occasionally suffer from rate limits (`429 Too Many Requests`). If Groq hits a rate limit or timeout, the pipeline catches the error and instantly invokes Gemini 3.5 Flash without crashing the user's workflow.
  - **Consistent Schema**: Both providers strictly honor the identical Pydantic structured output contract (`EmailClassification`).

---

### 1.4 Dynamic Few-Shot Memory (In-Context Reinforcement)
* **Decision**: Human supervisor corrections are stored in a persistent **ChromaDB vector store** (with JSON backup) and dynamically injected as few-shot exemplars into future LLM prompts.
* **Rationale**:
  - Fine-tuning weights on daily customer support corrections is expensive, slow, and operationally impractical.
  - In-context memory provides **instant adaptation**: the moment a supervisor corrects an intent (e.g. `isbn_metadata` -> `printing_issue`), similar future emails immediately benefit from that correction without changing a single line of model code.

---

### 1.5 Two-Layer Fast-Path Intake Filter ($0 Token Cost)
* **Decision**: Positioned a two-layer filter in front of the LLM pipeline (`backend/app/intake_filter.py`):
  - **Layer 1 (Deterministic Spam Heuristics)**: Detects commercial spam keywords and blacklisted domains in < 2ms, archiving them with **$0.00 token cost**.
  - **Layer 2 (Semantic Intent Cache)**: Matches recurring inquiries using cosine similarity against previously classified emails, returning cached classifications without duplicate LLM calls.

---

## 2. Core Architectural Invariants

The system is built upon three strict architectural invariants:

### Invariant 1: The Rejection Path Invariant
> **"A rejected action is guaranteed never to execute."**
* When a supervisor clicks **"Reject"** during human review, the LangGraph workflow transitions directly to the `END` terminal node.
* The execution node (`execute_action`) is completely bypassed. This guarantees that side-effects (e.g., dispatching refunds or changing ISBNs) can never occur after a rejection.

### Invariant 2: The Correction Loop Invariant
> **"A human correction triggers a full re-evaluation, not an unverified execution."**
* When a supervisor corrects an intent, the system does not simply execute the new intent blindly. Instead, it:
  1. Stores the correction in ChromaDB + JSON.
  2. Invalidates stale entries in the semantic intent cache.
  3. Re-classifies the email with the new correction injected as a few-shot example.
  4. Re-evaluates guardrails under the new category.
  5. Requests supervisor sign-off if the newly determined action is high-impact.

### Invariant 3: Cumulative Multi-Turn Clarification Invariant
> **"Partial user submissions are accumulated and remembered across turns."**
* If an author provides only part of the missing information (e.g., provides the Book Title but forgets the Order ID and photo proof), the state **concatenates** the new text with previous inputs (`existing_info + "
" + additional_info`) and merges attachments.
* The state is checkpointed in SQLite, so the agent never forgets what was previously submitted.

---

## 3. Current POC Limitations

While fully functional and feature-complete for the assessment, the current Proof of Concept operates under specific architectural constraints:

| Limitation Area | Current POC Implementation | Root Cause / Impact |
| :--- | :--- | :--- |
| **Persistence Storage** | Local SQLite (`checkpoints.db`) & Local JSON (`corrections.json`) | Single-node filesystem file locking. Does not scale horizontally across multiple container replicas. |
| **Email Ingestion** | Curated mock inbox (`sample_emails.py`) and UI compose modal | Incoming emails are simulated in-memory rather than polled from live IMAP/SMTP mailboxes or webhook endpoints. |
| **Attachment Proofs** | Local memory handling & filename references | File uploads are handled locally in memory rather than uploaded to cloud object storage (e.g. AWS S3 / GCS). |
| **Access Control (RBAC)**| Uniform interface for all users | No role differentiation between Frontline Support Agents, Senior Leads, and Finance Administrators. |
| **Batch Concurrency** | In-process sequential triage loop with rate-limit delays | Background triage runs within the FastAPI event loop rather than offloaded to a distributed worker queue (Celery/RabbitMQ). |

---

## 4. Production Upgrade Roadmap

To transition this system into an enterprise-grade, multi-tenant production platform, the following upgrades are planned:

```
+----------------------------------------------------------------------------------------------------+
|                                     ENTERPRISE PRODUCTION ROADMAP                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   [SendGrid / AWS SES] ---> [Kafka / SQS Queue] ---> [Distributed Workers] ---> [Managed PostgreSQL]     |
|   (Inbound Email Hooks)     (Message Streaming)      (FastAPI + Celery)       (AsyncPostgresSaver) |
|                                                             |                                      |
|                                                             +---> [Cloud Blob Storage (S3 / GCS)]  |
|                                                             |    (Pre-signed URLs for defect proofs) |
|                                                             |                                      |
|                                                             +---> [Qdrant / pgvector Vector Store] |
|                                                             |    (Enterprise semantic few-shot RAG)|
|                                                             |                                      |
|                                                             +---> [LangSmith / OpenTelemetry]      |
|                                                                  (Distributed APM & token tracing) |
+----------------------------------------------------------------------------------------------------+
```

### 4.1 Distributed Persistence: `AsyncPostgresSaver`
* **Upgrade**: Replace the single-file `SqliteSaver` with LangGraph's native **`AsyncPostgresSaver`** backed by managed PostgreSQL (AWS RDS / Supabase).
* **Benefits**: Enables horizontal scaling across multiple API instances, connection pooling, multi-AZ high availability, and cross-session ACID compliance.

### 4.2 Inbound Email Webhook Pipeline
* **Upgrade**: Connect directly to **SendGrid Inbound Parse**, **AWS SES**, or **Gmail Pub/Sub API**.
* **Benefits**:
  - Inbound author emails automatically parse headers (`In-Reply-To`, `References`, `Message-ID`) to map replies directly to the corresponding LangGraph thread.
  - Outbound auto-replies are dispatched directly via SMTP/API with authenticated DKIM/SPF signatures.

### 4.3 Cloud Object Storage & Multimodal Defect Verification
* **Upgrade**: Integrate **AWS S3** or **Google Cloud Storage** with pre-signed upload URLs for photo and video defect proofs.
* **Benefits**:
  - Secure, encrypted storage of author proof attachments.
  - Use **Gemini Multimodal / Google Cloud Vision API** to automatically inspect uploaded photos and verify whether page smudges or broken bindings are present before routing to a human lead.

### 4.4 Enterprise Role-Based Access Control (RBAC) & Audit Trails
* **Upgrade**: Introduce strict role separation via JWT / OAuth2:
  - **Tier 1 Agent**: View emails, submit missing info, request clarification.
  - **Support Supervisor**: Approve metadata edits, reassign teams, submit intent corrections.
  - **Finance Admin**: Review and authorize high-impact refunds.
* **Benefits**: Immutable audit logs recording which agent approved which action, with cryptographic timestamping for compliance.

### 4.5 Production Observability, Tracing & Cost Ceilings
* **Upgrade**: Integrate **LangSmith** or **Langfuse** alongside OpenTelemetry.
* **Benefits**:
  - Live tracing of token consumption, LLM latency percentiles (P95/P99), and failover frequency.
  - Hard daily token budgets per tenant with automatic circuit breakers to prevent denial-of-wallet attacks.

---

## 5. Agent Harness & Reliability Matrix

Summary comparison of the POC implementation versus the full production architecture:

| Reliability Dimension | POC Implementation | Production Upgrade Path |
| :--- | :--- | :--- |
| **Model Instructions** | Strict Pydantic JSON schema; XML isolation for untrusted text; delimiter sanitization. | Versioned prompt registries (Langfuse/LangSmith); automated regression evaluations. |
| **Permissions & Approvals** | LangGraph `interrupt()` pauses execution; supervisor modal required for high risk / urgency >= 4. | Role-Based Access Control (RBAC) with dual-authorization gates for high-value financial refunds. |
| **Memory & State** | SQLite `SqliteSaver` checkpointer; cumulative multi-turn string concatenation. | Managed PostgreSQL (`AsyncPostgresSaver`); vector-indexed historical conversation clustering. |
| **Failure Handling** | Groq Primary -> Gemini Failover; automatic retry counter (up to 2 retries); manual review fallback. | Distributed Dead Letter Queues (DLQ); exponential backoff with jitter; automated circuit breakers. |
| **Stopping Limits** | Hard stopping limits: max 3 correction loops per email; max 2 LLM retries; rejection exits directly to `END`. | Per-workflow configurable timeout budgets; max financial loss thresholds per author account. |
| **Logging & Tracing** | Timestamped state processing array streamed via Server-Sent Events (SSE). | OpenTelemetry distributed tracing; Datadog/NewRelic APM alerts; structured audit log streaming. |
| **Token / Cost Limits** | Fast-path deterministic spam filter ($0.00 cost) + semantic intent caching; fast/cost-effective models. | Per-department daily token ceilings; dynamic model routing (small 8B model for simple triage -> 70B for ambiguous tickets). |
