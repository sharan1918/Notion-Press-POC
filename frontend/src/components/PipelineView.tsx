import type { ProcessingResponse } from "../types";

export default function PipelineView({ state }: { state: ProcessingResponse["state"] | null }) {
  if (!state) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs p-6 text-center space-y-3 font-mono">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-xl text-primary">
          ⚙️
        </div>
        <p className="font-sans text-sm text-foreground font-semibold">No Active Workflow</p>
        <p className="max-w-xs text-muted-foreground">Select an author email and click <span className="text-primary font-semibold">Process with AI</span> to run the LangGraph pipeline.</p>
      </div>
    );
  }

  const status = state.final_status;
  const isPendingApproval = status === "pending_approval";
  const isPendingInfo = status === "pending_info";
  const isError = status === "error";
  const isRejected = status === "rejected";

  const steps = [
    { name: "Ingest Email", active: true, done: true },
    { name: "Fetch Corrections & Classify", active: true, done: !isError, error: isError },
    { name: "Determine Action", active: !isError, done: !isError && !!state.recommended_action },
    { 
      name: "Policy Check", 
      active: !!state.guardrail_result, 
      done: !!state.guardrail_result,
      label: state.missing_info_block ? "Missing Info Block" : state.approval_required ? "Approval Required" : "Safe Auto Execution"
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
      active: status === "executed", 
      done: status === "executed" 
    }
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2 tracking-tight">
          <span className="text-primary text-base">⚡</span> LangGraph State Machine
        </h3>
        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
          Stateful DAG
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
            icon = "⏸";
            iconColor = "text-amber-500";
            circleBg = "bg-amber-500/10 border-amber-500/30 animate-pulse-amber";
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
                    state?.missing_info_block ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                    state?.approval_required ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                    'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
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
          <div className="bg-background border border-border/80 rounded-lg p-3 h-36 overflow-y-auto font-mono text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
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
