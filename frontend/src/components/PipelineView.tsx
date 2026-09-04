import { useEffect, useRef } from "react";
import type { ProcessingResponse } from "../types";

interface Props {
  state: ProcessingResponse["state"] | null;
  isStreaming?: boolean;
}

export default function PipelineView({ state, isStreaming = false }: Props) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll execution log to bottom as new events arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [state?.processing_log]);

  if (!state) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs p-6 text-center space-y-3 font-mono">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-xl text-primary">
          ⚙️
        </div>
        <p className="font-sans text-sm text-foreground font-semibold">No Active Workflow</p>
        <p className="max-w-xs text-muted-foreground">Select an author email to automatically trigger the LangGraph AI pipeline in real-time.</p>
      </div>
    );
  }

  const status = state.final_status;
  const isPendingApproval = status === "pending_approval";
  const isPendingInfo = status === "pending_info";
  const isError = status === "error";
  const isRejected = status === "rejected";

  const hasClassified = !!state.classification;
  const hasAction = !!state.recommended_action;
  const hasGuardrail = !!state.guardrail_result;

  const intakeResult = state.intake_result;
  const skippedLLM = intakeResult === "spam_filtered";
  const skippedByCache = intakeResult === "cache_hit";

  const steps = [
    { 
      name: "Ingest Email", 
      active: true, 
      done: true 
    },
    {
      name: "Intake Filter",
      active: true,
      done: !!intakeResult || hasClassified,
      pending: isStreaming && !intakeResult && !hasClassified,
      label: intakeResult === "spam_filtered" ? "⚡ Fast-Path Spam" :
             intakeResult === "cache_hit" ? "💾 Cache Hit" :
             (hasClassified || hasAction) ? "Passed to LLM" : undefined
    },
    { 
      name: "Fetch Corrections & Classify", 
      active: !skippedLLM && !skippedByCache,
      done: hasClassified && !isError && !skippedLLM && !skippedByCache, 
      pending: isStreaming && !hasClassified && !skippedLLM && !skippedByCache,
      error: isError,
      skipped: skippedLLM || skippedByCache,
      label: (skippedLLM || skippedByCache) ? "Skipped ($0.00)" : undefined
    },
    { 
      name: "Determine Action", 
      active: hasClassified, 
      done: hasAction && !isError,
      pending: isStreaming && hasClassified && !hasAction
    },
    { 
      name: "Policy Check", 
      active: hasAction || hasGuardrail, 
      done: hasGuardrail,
      pending: isStreaming && hasAction && !hasGuardrail,
      label: state.missing_info_block ? "Missing Info Block" : state.approval_required ? "Approval Required" : hasGuardrail ? "Safe Auto Execution" : undefined
    },
    {
      name: "Human Approval",
      active: state.approval_required || isPendingApproval,
      done: state.human_decision !== undefined,
      pending: isPendingApproval,
      rejected: isRejected
    },
    {
      name: "Missing Info Request",
      active: state.missing_info_block || isPendingInfo,
      done: !!state.supplementary_info,
      pending: isPendingInfo
    },
    { 
      name: "Execute Action", 
      active: status === "executed" || (!state.approval_required && !state.missing_info_block && hasGuardrail), 
      done: status === "executed" 
    }
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2 tracking-tight">
          <span className="text-primary text-base">⚡</span> LangGraph State Machine
        </h3>
        <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
          isStreaming 
            ? "bg-primary/20 text-primary border-primary animate-pulse" 
            : "bg-primary/10 text-primary border-primary/20"
        }`}>
          {isStreaming ? "Live Executing" : "Stateful DAG"}
        </span>
      </div>
      
      {/* Pipeline Steps List */}
      <div className="space-y-0 relative">
        <div className="absolute left-3.5 top-3.5 bottom-3.5 w-0.5 bg-border z-0"></div>
        
        {steps.map((step, idx) => {
          if (!step.active && !step.pending) return null;
          
          let icon = "○";
          let iconColor = "text-muted-foreground";
          let circleBg = "bg-card border-border";
          
          if (step.done) {
            icon = "✓";
            iconColor = "text-emerald-500 font-bold";
            circleBg = "bg-emerald-500/10 border-emerald-500/30";
          } else if (step.error || step.rejected) {
            icon = "✕";
            iconColor = "text-rose-500 font-bold";
            circleBg = "bg-rose-500/10 border-rose-500/30";
          } else if (step.pending) {
            icon = "⚡";
            iconColor = "text-amber-500 animate-spin";
            circleBg = "bg-amber-500/10 border-amber-500/30 animate-pulse";
          } else if (step.active) {
            icon = "○";
            iconColor = "text-primary";
            circleBg = "bg-primary/10 border-primary/30";
          }
          
          return (
            <div key={idx} className="flex gap-3.5 relative z-10 pb-5 last:pb-0">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-xs ${circleBg}`}>
                <span className={iconColor}>{icon}</span>
              </div>
              <div className="pt-0.5 min-w-0">
                <p className={`text-xs font-semibold tracking-tight ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.name}
                </p>
                {step.label && (
                  <span className={`text-[10px] uppercase font-mono font-bold mt-1 inline-block px-1.5 py-0.5 rounded border ${
                    state?.missing_info_block ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' :
                    state?.approval_required ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' :
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  }`}>
                    {step.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Real-time State Log */}
      {state.processing_log && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Execution Log</h4>
            <span className="text-[10px] font-mono text-muted-foreground">{state.processing_log.length} events</span>
          </div>
          <div 
            ref={logContainerRef}
            className="bg-background border border-border/80 rounded-lg p-3 h-36 overflow-y-auto font-mono text-[11px] text-muted-foreground space-y-1.5 leading-relaxed scroll-smooth"
          >
            {state.processing_log.map((log, i) => (
              <div key={i} className="text-foreground/80 hover:text-primary transition-colors">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
