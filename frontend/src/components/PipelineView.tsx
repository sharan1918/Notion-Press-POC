import type { ProcessingResponse } from "../types";

export default function PipelineView({ state }: { state: ProcessingResponse["state"] | null }) {
  if (!state) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
        Select an email and process it to see the workflow pipeline.
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
      label: state.missing_info_block ? "Missing Info" : state.approval_required ? "Approval Req." : "Safe"
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
    <div className="p-6 bg-card rounded-lg border border-border">
      <h3 className="font-semibold mb-6 flex items-center gap-2">
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        LangGraph Pipeline
      </h3>
      
      <div className="space-y-0 relative">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-border z-0"></div>
        
        {steps.map((step, idx) => {
          if (!step.active && !step.pending) return null;
          
          let icon = "○";
          let iconColor = "text-muted-foreground";
          let bgColor = "bg-card";
          
          if (step.done) {
            icon = "✓";
            iconColor = "text-green-500";
          } else if (step.error || step.rejected) {
            icon = "❌";
            iconColor = "text-destructive";
          } else if (step.pending) {
            icon = "⏸";
            iconColor = "text-amber-500";
            bgColor = "animate-pulse-amber rounded-full";
          } else if (step.active) {
            icon = "○";
            iconColor = "text-primary";
          }
          
          return (
            <div key={idx} className="flex gap-4 relative z-10 pb-6 last:pb-0">
              <div className={`w-8 h-8 rounded-full border border-border flex items-center justify-center shrink-0 ${bgColor}`}>
                <span className={`text-sm ${iconColor}`}>{icon}</span>
              </div>
              <div className="pt-1">
                <p className={`text-sm font-medium ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.name}
                </p>
                {step.label && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-mono mt-1 block">
                    {step.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {state.processing_log && (
        <div className="mt-8 pt-6 border-t border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Processing Log</h4>
          <div className="bg-secondary/50 rounded p-3 h-32 overflow-y-auto font-mono text-[10px] text-muted-foreground space-y-1">
            {state.processing_log.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
