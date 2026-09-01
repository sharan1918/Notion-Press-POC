# Design Notes

This document addresses the reliability requirements for the Notion Press email processing system.

| Topic | POC Approach | Production Upgrade |
|---|---|---|
| **Guardrails** | Deterministic Python policy engine evaluates risk | Role-based rules, configurable per-tenant policies |
| **Feedback Store**| JSON file with smart retrieval (recent + category) | Vector DB (ChromaDB/Pinecone) for semantic similarity |
| **Checkpointing** | SQLite `SqliteSaver` | PostgreSQL `AsyncPostgresSaver` |
| **Retries** | 2 retries (3 total attempts), fallback to manual review | Exponential backoff, circuit breaker, DLQ |
| **Stopping Limits**| Max 3 corrections per email | Configurable per workflow |
| **Idempotency** | Simulated (logged) | Idempotency keys for non-repeatable actions |
| **Logging** | Processing log array in state | LangSmith / Langfuse structured tracing |
| **Cost** | Gemini 2.0 Flash (fast, cheap) | Token budgets, model routing (small → large fallback) |
| **Missing Info** | `interrupt()` + resume with supplementary info | Real email reply thread parsing |

## The Rejection Path Invariant
A key invariant in this architecture is that rejected actions are never executed. When a human selects "Reject" during the approval node, the graph routes directly to the `END` node, bypassing the `execute_action` node completely.

## The Correction Loop Invariant
When a human corrects an AI classification, the system does not simply execute the action based on the new intent. Instead, it triggers a **full re-evaluation**:
1. Store the feedback.
2. Re-fetch relevant corrections.
3. Re-classify the email (now with the correction as a few-shot example).
4. Re-determine the action.
5. Re-run the guardrails.
6. Request approval again if required.
