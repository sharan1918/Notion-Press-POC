import type { ProcessingResponse } from "../types";

export default function ProcessingResult({ state }: { state: ProcessingResponse["state"] }) {
  if (!state.classification) return null;
  const { classification, recommended_action, guardrail_result } = state;

  return (
    <div className="space-y-5 mt-6 animate-fadeIn">
      {/* Top Metrics Row: Intent, Urgency, Confidence */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              classification.confidence >= 0.7 ? "text-emerald-500" : 
              classification.confidence >= 0.5 ? "text-amber-500" : "text-rose-500"
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
                classification.urgency >= 4 ? 'text-rose-500' : classification.urgency >= 3 ? 'text-amber-500' : 'text-emerald-500'
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
      </div>

      {/* AI Explanation Box */}
      <div className="p-4 bg-card rounded-xl border border-border shadow-sm">
        <p className="text-[11px] font-mono text-primary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <span>🤖</span> AI Decision Explanation
        </p>
        <p className="text-xs text-foreground/90 leading-relaxed">
          {classification.classification_explanation}
        </p>
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
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Key Extracted Details</p>
          <ul className="space-y-1.5 text-xs text-foreground/90">
            {classification.key_details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary font-bold">▪</span>
                <span>{detail}</span>
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
            ? 'bg-amber-500/10 border-amber-500/30' 
            : 'bg-card border-border'
        }`}>
          <p className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${
            classification.missing_information.length > 0 ? 'text-amber-500' : 'text-muted-foreground'
          }`}>
            Missing Information
          </p>
          <ul className="space-y-1.5 text-xs text-foreground/90">
            {classification.missing_information.map((info, i) => (
              <li key={i} className="flex items-start gap-2 text-amber-500">
                <span className="font-bold">⚠️</span>
                <span>{info}</span>
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
            </div>
            {guardrail_result && (
              <span className={`px-2.5 py-1 text-[10px] uppercase font-mono font-bold rounded-full border ${
                guardrail_result.risk_level === 'high' ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' :
                guardrail_result.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
              }`}>
                {guardrail_result.risk_level} Risk
              </span>
            )}
          </div>
          
          {guardrail_result && guardrail_result.reasons.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <p className="text-[11px] font-mono text-muted-foreground mb-2">Deterministic Guardrail Evaluation:</p>
              <ul className="text-xs space-y-1">
                {guardrail_result.reasons.map((reason, i) => (
                  <li key={i} className="flex items-center gap-2 text-amber-500 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
