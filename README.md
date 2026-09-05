# AI-Powered Email Processing System — Notion Press

An AI-powered email processing system for Notion Press author support, built as a Proof of Concept (POC) for the Junior Engineer Assessment. 

This system classifies incoming author emails, recommends an appropriate action, and enforces deterministic safety guardrails, including a full Human-in-the-Loop (HITL) approval flow for high-impact actions. It also supports a feedback loop where human corrections trigger a full re-evaluation of the workflow.

## 🏗 Architecture

The system uses a single AI decision component orchestrated by a stateful LangGraph workflow with deterministic policy guardrails, fast-path intake filtering, and multi-provider LLM failover.

```text
                           [ 1. INCOMING EMAIL ]
                Raw Email Payload (Subject, Body, Attachments)
                                     │
                                     ↓
                          [ 2. USER INTERFACE ]
                       React 18 + TypeScript + Vite
                   Mock Inbox UI & Real-Time SSE Triage
                                     │
                                     │  REST API & SSE /api/process-stream
                                     ↓
                          [ 3. BACKEND GATEWAY ]
                       FastAPI (Python 3.13 Async)
                                     │
                                     ↓
                         [ 4. SMART INTAKE FILTER ]
                   Fast-Path Spam & Semantic Intent Cache
                        (Pure Python & ChromaDB, $0)
                                     │
             ┌───────────────────────┼───────────────────────┐
             ↓                       ↓                       ↓
     [ INSTANT SPAM ]        [ REPEAT INQUIRY ]       [ NEW INQUIRY ]
   Deterministic Filter     Cosine Sim >= 0.90      LangGraph State Machine
   (Spam Domains/Words)     (Reuse Stored Intent)   (fetch_and_classify node)
      Instant Archive         Skip LLM Inference     Groq GPT-OSS-120B (Primary)
        ($0 / ~1ms)               ($0 / ~5ms)        Gemini 3.5 Flash (Failover)
             │                       │               + Few-Shot ChromaDB Vectors
             │                       │                       │
             │                       └───────────┬───────────┘
             │                                   │
             │                                   ↓
             │                          [ 5. SAFETY RULES ]
             │                       Deterministic Policy Engine
             │                      (Pure Python Rules: policy.py)
             │                      + Grounded Policy KB (ChromaDB)
             │                                   │
             │               ┌───────────────────┼───────────────────┐
             │               ↓                   ↓                   ↓
             │      [ ROUTE DIRECTLY ]   [ NEED MORE INFO ]  [ MANAGER APPROVAL ]
             │       Safe Actions Auto   Missing Identifiers  High Risk / Urgency>=4
             │      (Urgency<4, Conf>=0.7) LangGraph interrupt  LangGraph interrupt
             │               │           Author Command(resume) Supv Command(resume)
             │               │                   │            Approve/Reject/Correct
             │               │              Author Reply      (ChromaDB Feedback DB)
             │               │                   │                   │
             │               └───────────────────┴───────────────────┘
             │                                   │
             ↓                                   ↓
      [ 6. ARCHIVE ]                    [ 7. RESOLUTION ]
     Instant Quarantine               LCEL Grounded Auto-Reply
    (Zero LLM Token Cost)          (PromptTemplate | LLM | Parser)
                                     Execute Action & Send Reply
                                                 │
                                                 ↓
                                       [ 8. SYSTEM MEMORY ]
                                    Persistence & Checkpointing
                               ┌─────────────────┴─────────────────┐
                               ↓                                   ↓
                          SQLiteSaver                           ChromaDB
                        (checkpoints.db)                    (Vector Storage)
                     Thread State Recovery                Dynamic Few-Shot RAG
                      & HITL Resumption                   & Policy Collections
```

### 🏷️ Plain-English Flow Guide (For Non-Technical Reviewers)

| Stage Tag | What It Does | Business Value |
| :--- | :--- | :--- |
| **`[ 1. INCOMING EMAIL ]`** | Author sends an inquiry (royalties, printing status, manuscript questions). | Centralized, omnichannel support ingestion. |
| **`[ 2. USER INTERFACE ]`** | Support agents view real-time triage, live streaming analysis, and approval cards. | Clear, progressive UI without loading delays. |
| **`[ 3. BACKEND GATEWAY ]`** | High-performance FastAPI server coordinates the stateful workflow. | Reliable, scalable, and secure API tier. |
| **`[ 4. SMART INTAKE FILTER ]`** | Filters junk spam instantly and matches repeated inquiries from semantic cache. | **$0 token cost** — saves money and responds in under 5ms. |
| **`[ 5. SAFETY RULES ]`** | Pure Python deterministic guardrails ensure safe business policy compliance. | Eliminates AI hallucination on refunds or sensitive actions. |
| **`[ 6. ARCHIVE ]`** | Commercial marketing and spam emails are quarantined without calling AI. | Keeps human agents focused strictly on real authors. |
| **`[ 7. RESOLUTION ]`** | Policy-grounded reply is drafted and approved actions are executed automatically. | Fast, consistent, and courteous author support. |
| **`[ 8. SYSTEM MEMORY ]`** | Saves thread states and supervisor corrections into persistent vector storage. | AI remembers conversations and learns from past corrections. |

## 🧠 Architecture Decisions

- **Why LangGraph?** We need conditional branching, human-in-the-loop interruption, resumability, and stopping conditions. LangGraph provides these as first-class primitives.
- **Why SSE Streaming & Auto-Processing?** Clicking an email automatically streams LangGraph node events via Server-Sent Events (SSE) in real-time and caches results. This eliminates manual trigger delays and provides progressive UI feedback while preserving API efficiency.
- **Why Multi-Provider Failover (Groq + Gemini 3.5 Flash)?** Primary classification uses Groq (`openai/gpt-oss-120b`) for sub-second inference speeds (~500 tokens/sec), with seamless automatic fallback to Gemini 3.5 Flash if Groq rate limits or network issues occur.
- **Why LangChain?** Used strictly for model interfaces and structured output abstraction (`.with_structured_output()`). No unnecessary agents or chains.
- **Why not multi-agent?** A single AI decision component inside a stateful workflow is simpler, easier to test, and more reliable than a swarm of autonomous agents.
- **Why deterministic guardrails?** An LLM should recommend actions, but standard Python code should enforce business safety logic.
- **Why ChromaDB Vector Retrieval?** Employs persistent ChromaDB vector storage (`hnsw:space: cosine`) for semantic few-shot correction retrieval and verified Notion Press policy grounding, with a human-readable JSON backup for auditability.

## 📚 Assessment Deliverables & Documentation

- 📝 **[Design Decisions, Limitations & Roadmap](docs/DESIGN_DECISIONS_AND_LIMITATIONS.md)**: Dedicated assessment deliverable detailing core decisions, invariants, current limitations, and production upgrades.
- 📐 **[System Design & Architecture](docs/SYSTEM_DESIGN.md)**: Detailed breakdown of design decisions, multi-provider failover, HITL states, and production roadmap.

## 🚀 Quick Start

1. **Clone the repository**
2. **Backend Setup**
   ```bash
   cd backend
   uv venv
   uv pip install -r requirements.txt
   # Copy .env.example to .env and add your GOOGLE_API_KEY
   uv run uvicorn app.main:app --reload
   ```
3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. **Open** `http://localhost:5173`

## 🛡️ Reliability & Agent Harness (Production Considerations)

- **Retries**: LLM calls retry automatically on failure (up to 2 times). After 3 total attempts, the workflow routes to manual review.
- **Idempotency**: Non-repeatable actions (e.g. `issue_refund`) require an idempotency key in production to prevent duplicate executions from network retries.
- **Stopping Conditions**: Maximum correction loops (3) and maximum retries (2) prevent infinite loops.
- **Persistence**: LangGraph state is persisted using a SQLite Checkpointer to survive server restarts during `interrupt()` waits.

## 🚀 CI/CD & Cloud Deployment

- **CI Pipeline**: Automated backend test suite (`pytest`) and frontend verification (`oxlint` + `vite build`) via GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
- **Backend Deployment**: Containerized on **Koyeb** via [`backend/Dockerfile`](backend/Dockerfile) with dynamic port handling and CORS support.
- **Frontend Deployment**: Hosted on **Vercel** with global edge CDN and automatic PR previews.
