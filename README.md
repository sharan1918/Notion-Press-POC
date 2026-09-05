# AI-Powered Email Processing System — Notion Press

An AI-powered email processing system for Notion Press author support, built as a Proof of Concept (POC) for the Junior Engineer Assessment. 

This system classifies incoming author emails, recommends an appropriate action, and enforces deterministic safety guardrails, including a full Human-in-the-Loop (HITL) approval flow for high-impact actions. It also supports a feedback loop where human corrections trigger a full re-evaluation of the workflow.

## 🏗 Architecture

The system uses a single AI decision component orchestrated by a stateful LangGraph workflow with deterministic policy guardrails, fast-path intake filtering, and multi-provider LLM failover.

```text
                           [ 1. INCOMING EMAIL ]
                          Author Email / Inquiry
                                     │
                                     ↓
                          [ 2. USER INTERFACE ]
                         Frontend (React + Vite)
                        [Mock Inbox & Live Triage]
                                     │
                                     │  REST API & SSE Stream
                                     ↓
                          [ 3. BACKEND GATEWAY ]
                             FastAPI Backend
                                     │
                                     ↓
                         [ 4. SMART INTAKE FILTER ]
                         Cost-Saving Fast-Path ($0)
                                     │
             ┌───────────────────────┼───────────────────────┐
             ↓                       ↓                       ↓
     [ INSTANT SPAM ]        [ REPEAT INQUIRY ]       [ NEW INQUIRY ]
      Instant Archive       Reuse Cached Answer      AI Classification
       (Zero Tokens)         (Zero Extra Cost)     (Groq + Gemini Backup)
             │                       │             (+ Few-Shot Corrections)
             │                       │                       │
             │                       └───────────┬───────────┘
             │                                   │
             │                                   ↓
             │                          [ 5. SAFETY RULES ]
             │                          Policy & Guardrails
             │                      (Strict Pure-Python Rules)
             │                      (+ Verified Company Guide)
             │                                   │
             │               ┌───────────────────┼───────────────────┐
             │               ↓                   ↓                   ↓
             │      [ ROUTE DIRECTLY ]   [ NEED MORE INFO ]  [ MANAGER APPROVAL ]
             │         Safe Actions         Author Clarify     High-Risk / Refund
             │        (e.g., Guides)     (Request Details)     Supervisor Review
             │               │                   │                   │
             │               │              Author Reply     Approve or Correct
             │               │                   │                   │
             │               └───────────────────┴───────────────────┘
             │                                   │
             ↓                                   ↓
      [ 6. ARCHIVE ]                    [ 7. RESOLUTION ]
       Junk Ignored                      Execute Action
      (Zero AI Cost)                 (Auto-Reply / Route)
                                                 │
                                                 ↓
                                       [ 8. SYSTEM MEMORY ]
                                     Saved for Future Learning
                               ┌─────────────────┴─────────────────┐
                               ↓                                   ↓
                         Conversation                     Learned Corrections
                           History                          & Company Rules
                     (Resume At Any Time)                 (ChromaDB Memory)
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
- 🛡️ **[Design Notes & Reliability](DESIGN_NOTES.md)**: Analysis of agent harness, failure recovery, stopping limits, and invariant safety checks.
- ⚡ **[Intake Filter Optimization](docs/INTAKE_FILTER_DESIGN.md)**: Fast-path cost reduction engine ($0 spam triage + semantic caching).
- 🚀 **[Deployment & CI/CD Guide](docs/DEPLOYMENT.md)**: Automated GitHub Actions CI pipeline, Docker containers, and cloud deployment guides.

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
- **Full Guide**: See [Deployment & CI/CD Guide](docs/DEPLOYMENT.md).
