# Multi-Model Evaluation & Selection Proof Report
**Notion Press AI-Powered Author Support Email System**  
*Evaluation Run: 2026-11-10 12:05:58 | Benchmark Dataset: 20 Production Author Inquiries*

---

## Executive Summary: Model Trade-Off Matrix

| Evaluation Dimension | 🥇 Google Gemini 2.5 Flash | 🥈 OpenAI GPT-4o | 🥉 OpenAI GPT-4o Mini | 🏅 Meta Llama 3.3 70B |
| :--- | :---: | :---: | :---: | :---: |
| **Model ID** | `google/gemini-2.5-flash` | `openai/gpt-4o` | `openai/gpt-4o-mini` | `meta-llama/llama-3.3-70b-instruct` |
| **Model Tier** | **Workhorse / High-Speed** | Flagship Reasoning | Lightweight Compact | Open-Weights Enterprise |
| **Classification Accuracy** | **100.0%** | 100.0% | 100.0% | 95.0% |
| **Macro-F1 Score** | **1.000** | 1.000 | 1.000 | 0.950 |
| **JSON Schema Compliance** | **100.0%** | 100.0% | 100.0% | 100.0% |
| **Anti-Hallucination Halt** | **100.0%** | 100.0% | 100.0% | 100.0% |
| **Safety Breach Rate** | **0.00% (Zero Tolerance)** | 0.00% | 0.00% | 0.00% |
| **Median Latency ($P_{50}$)** | **699 ms** | 2466 ms | 805 ms | 1237 ms |
| **90th % Latency ($P_{90}$)** | **738 ms** | 2496 ms | 836 ms | 1275 ms |
| **Cost per 1,000 Emails** | **$0.070** | $2.325 | $0.140 | $0.206 |
| **Cost per 10,000 Emails** | **$0.70** | $23.25 | $1.40 | $2.06 |
| **Final Recommendation** | **🏆 PRIMARY WORKHORSE** | ⚠️ Overkill / Expensive | ⚡ Secondary Fallback | 🛡️ Self-Hosted Alternative |

---

## Why Gemini 2.5 Flash is Proven Best for Notion Press:

1. **Zero Compromise on NLU Accuracy:**
   Gemini 2.5 Flash achieves **100.0% accuracy** and a **1.000 Macro-F1**, matching the $2.50/M token GPT-4o model on all 8 author intents.
2. **3.6x Faster Turnaround:**
   At **699 ms**, Gemini Flash delivers instantaneous classification and live SSE streaming in the dashboard, whereas GPT-4o takes 2466 ms.
3. **33x Cost Savings at Scale:**
   Processing 10,000 customer inquiries costs **$0.70** on Gemini 2.5 Flash compared to **$23.25** on GPT-4o (a **97% cost reduction**).
4. **Safety Invariants Decoupled from LLM:**
   Safety rules (such as refund thresholds and missing ISBN halts) are deterministically enforced by our Python guardrail engine (`policy.py`), ensuring a **0.00% safety breach rate** across all models.
5. **Zero Downtime Fallback Chain:**
   If Gemini experiences temporary upstream rate-limits, our LangGraph fallback chain automatically routes requests to GPT-4o Mini and Llama 3.3 70B with zero disruption.
