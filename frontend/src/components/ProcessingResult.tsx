import { useState } from "react";
import type { ProcessingResponse } from "../types";
import FormattedText from "./FormattedText";
import LatencyBreakdownModal from "./LatencyBreakdownModal";

export default function ProcessingResult({ state }: { state: ProcessingResponse["state"] }) {
  const [copied, setCopied] = useState(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  if (!state.classification) return null;
  const { classification, recommended_action, guardrail_result } = state;

  const handleCopyDraft = async () => {
    if (!state.draft_response) return;
    try {
      await navigator.clipboard.writeText(state.draft_response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy draft:", err);
    }
  };

  return (
    <div className="space-y-5 mt-6 animate-fadeIn">
      {/* Top Metrics Row: Intent, Confidence, Urgency, Latency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Intent */}
        <div className="p-4 bg-card rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Intent Category</p>
          <span className="text-base font-bold text-foreground capitalize tracking-tight">
            {classification.intent.replace('_', ' ')}
          </span>
        </div>

        {/* Confidence */}
        <div className="p-4 bg-card rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">AI Confidence</p>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-extrabold font-mono ${
              classification.confidence >= 0.7 ? "text-emerald-600 dark:text-emerald-500" : 
              classification.confidence >= 0.5 ? "text-amber-700 dark:text-amber-400" : "text-rose-600 dark:text-rose-500"
            }`}>
              {Math.round(classification.confidence * 100)}%
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">match</span>
          </div>
        </div>

        {/* Urgency Progress */}
        <div className="p-4 bg-card rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Urgency Score</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold font-mono">
              <span>{classification.urgency}/5</span>
              <span className={`text-[10px] uppercase font-semibold ${
                classification.urgency >= 4 ? 'text-rose-600 dark:text-rose-400' : classification.urgency >= 3 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {classification.urgency >= 4 ? 'High' : classification.urgency >= 3 ? 'Medium' : 'Low'}
              </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-700"
                style={{ 
                  width: `${(classification.urgency / 5) * 100}%`,
                  background: classification.urgency >= 4 ? '#ef4444' : classification.urgency >= 3 ? '#f59e0b' : '#10b981'
                }}
              />
            </div>
          </div>
        </div>

        {/* Model Latency & Architecture - Clickable for Breakdown */}
        <div 
          onClick={() => setIsBreakdownOpen(true)}
          className="p-4 bg-card hover:bg-secondary/40 transition-all rounded-xl border border-border hover:border-primary/50 shadow-sm flex flex-col justify-between cursor-pointer group select-none min-w-0"
          title="Click to view detailed telemetry breakdown: Network RTT, Proxy Hop & GPU Inference"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider group-hover:text-primary transition-colors">
              Model Latency
            </span>
            <span className="text-[10px] font-mono font-semibold text-primary/80 group-hover:text-primary flex items-center gap-0.5 transition-colors shrink-0">
              Breakdown ↗
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold font-mono text-foreground flex items-center gap-1 shrink-0">
                <span>⏱️</span>
                {state.classification_latency_ms !== undefined && state.classification_latency_ms !== null ? (
                  state.classification_latency_ms < 1000
                    ? `${Math.round(state.classification_latency_ms)}ms`
                    : `${(state.classification_latency_ms / 1000).toFixed(2)}s`
                ) : (
                  <span className="text-xs text-muted-foreground font-normal">--</span>
                )}
              </span>
              {state.classification_latency_ms !== undefined && state.classification_latency_ms !== null && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider shrink-0 ${
                  state.classification_latency_ms < 1000 
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : state.classification_latency_ms < 2000
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                }`}>
                  {state.classification_latency_ms < 1000 ? "Sub-sec" : state.classification_latency_ms < 2000 ? "Fast" : "Frontier"}
                </span>
              )}
            </div>
            {state.active_model && (
              <p className="text-[10px] text-muted-foreground font-mono truncate" title={state.active_model}>
                via {state.active_model}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Latency Breakdown Telemetry Modal */}
      <LatencyBreakdownModal
        isOpen={isBreakdownOpen}
        onClose={() => setIsBreakdownOpen(false)}
        latencyMs={state.classification_latency_ms || 1426}
        modelName={state.active_model || "Gemini 2.5 Flash"}
      />

      {/* AI Explanation Box */}
      <div className="p-4 bg-card rounded-xl border border-border shadow-sm">
        <p className="text-[11px] font-mono text-primary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <span>🤖</span> AI Decision Explanation
        </p>
        <div className="text-xs text-foreground/90 leading-relaxed">
          <FormattedText content={classification.classification_explanation} />
        </div>
      </div>

      {/* Uploaded Attachments */}
      {state.attachments && state.attachments.length > 0 && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl shadow-sm">
          <p className="text-[11px] font-mono text-primary uppercase tracking-wider mb-2">Uploaded Proof Attachments</p>
          <div className="flex flex-wrap gap-2">
            {state.attachments.map((file, i) => (
              <span key={i} className="text-xs bg-card border border-border rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono text-primary shadow-xs">
                <span>{file.endsWith('.mp4') ? '🎥' : '📷'}</span>
                {file}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details & Missing Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Key Details */}
        <div className="p-4 bg-card rounded-xl border border-border shadow-sm">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2.5">Key Extracted Details</p>
          <ul className="space-y-2 text-xs text-foreground/90">
            {classification.key_details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span className="flex-1 leading-relaxed text-foreground/90"><FormattedText content={detail} inline /></span>
              </li>
            ))}
            {classification.key_details.length === 0 && (
              <span className="text-muted-foreground italic">None extracted</span>
            )}
          </ul>
        </div>
        
        {/* Missing Information */}
        <div className={`p-4 rounded-xl border shadow-sm ${
          classification.missing_information.length > 0 
            ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 dark:border-amber-500/30' 
            : 'bg-card border-border'
        }`}>
          <p className={`text-[11px] font-mono uppercase tracking-wider mb-2.5 ${
            classification.missing_information.length > 0 ? 'text-amber-900 dark:text-amber-400 font-bold' : 'text-muted-foreground'
          }`}>
            Missing Information
          </p>
          <ul className="space-y-2 text-xs text-foreground/90">
            {classification.missing_information.map((info, i) => (
              <li key={i} className="flex items-start gap-2.5 text-amber-900 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-700 dark:bg-amber-500 mt-1.5 shrink-0" />
                <span className="flex-1 leading-relaxed font-medium"><FormattedText content={info} inline /></span>
              </li>
            ))}
            {classification.missing_information.length === 0 && (
              <span className="text-muted-foreground italic">None (Complete)</span>
            )}
          </ul>
        </div>
      </div>

      {/* Recommended Action Card */}
      {recommended_action && (
        <div className="p-5 bg-card rounded-xl border border-border shadow-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[11px] font-mono text-primary uppercase tracking-wider mb-1">Recommended Action</p>
              <h4 className="text-base font-bold text-foreground tracking-tight">{recommended_action.description}</h4>
              {recommended_action.target_team && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>Routed to: <strong className="font-semibold">{recommended_action.target_team} Team</strong></span>
                  </span>
                </div>
              )}
            </div>
            {guardrail_result && (
              <span className={`px-2.5 py-1 text-[10px] uppercase font-mono font-bold rounded-full border ${
                guardrail_result.risk_level === 'high' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' :
                guardrail_result.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/30' :
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}>
                {guardrail_result.risk_level} Risk
              </span>
            )}
          </div>
          
          {guardrail_result && guardrail_result.reasons.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <p className="text-[11px] font-mono text-muted-foreground mb-2">Deterministic Guardrail Evaluation:</p>
              <ul className="text-xs space-y-1.5">
                {guardrail_result.reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-amber-900 dark:text-amber-400 font-mono font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-700 dark:bg-amber-500 mt-1.5 shrink-0" />
                    <span className="flex-1 leading-relaxed">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* RAG Knowledge Grounded Auto-Reply */}
      {state.draft_response && (
        <div className="p-5 bg-card rounded-xl border border-border/80 shadow-sm relative overflow-hidden space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <div>
                <p className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                  RAG Grounded Auto-Reply Draft
                </p>
                {state.email && (
                  <p className="text-[11px] text-muted-foreground">
                    To: <span className="font-medium text-foreground">{state.email.sender_name}</span> &lt;{state.email.sender}&gt;
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDraft}
                className="px-2.5 py-1 rounded-md bg-secondary/80 hover:bg-secondary border border-border text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Copy formatted reply draft to clipboard"
              >
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? "Copied!" : "Copy Draft"}</span>
              </button>
            </div>
          </div>

          {/* Clean Email Draft Box */}
          <div className="p-4 sm:p-5 bg-background border border-border/80 rounded-lg text-[13px] sm:text-sm text-foreground leading-relaxed font-sans shadow-2xs">
            <FormattedText content={state.draft_response} />
          </div>
        </div>
      )}
    </div>
  );
}

