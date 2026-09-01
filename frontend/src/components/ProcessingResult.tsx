import type { ProcessingResponse } from "../types";

export default function ProcessingResult({ state }: { state: ProcessingResponse["state"] }) {
  if (!state.classification) return null;
  const { classification, recommended_action, guardrail_result } = state;

  return (
    <div className="space-y-6 mt-6 animate-fadeIn">
      <div className="grid grid-cols-2 gap-4">
        {/* Intent & Confidence */}
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Intent</p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold capitalize">{classification.intent.replace('_', ' ')}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={`text-sm font-bold ${
                classification.confidence >= 0.7 ? "text-green-500" : 
                classification.confidence >= 0.5 ? "text-amber-500" : "text-red-500"
              }`}>
                {Math.round(classification.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Urgency */}
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Urgency</p>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{classification.urgency}/5</span>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000"
                style={{ 
                  width: `${(classification.urgency / 5) * 100}%`,
                  background: classification.urgency >= 4 ? '#ef4444' : classification.urgency >= 3 ? '#f59e0b' : '#22c55e'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="p-4 bg-secondary/30 rounded-lg border border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">AI Explanation</p>
        <p className="text-sm">{classification.classification_explanation}</p>
      </div>

      {/* Uploaded Attachments */}
      {state.attachments && state.attachments.length > 0 && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 font-mono">Uploaded Proof Attachments</p>
          <div className="flex flex-wrap gap-2">
            {state.attachments.map((file, i) => (
              <span key={i} className="text-xs bg-secondary border border-border rounded px-3 py-1.5 flex items-center gap-2 font-mono text-blue-400">
                <span>{file.endsWith('.mp4') ? '🎥' : '📷'}</span>
                {file}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details & Missing Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Key Details</p>
          <ul className="list-disc list-inside text-sm space-y-1">
            {classification.key_details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
            {classification.key_details.length === 0 && <span className="text-muted-foreground italic">None extracted</span>}
          </ul>
        </div>
        
        <div className={`p-4 rounded-lg border ${classification.missing_information.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-secondary/30 border-border'}`}>
          <p className={`text-xs uppercase tracking-wider mb-2 ${classification.missing_information.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
            Missing Information
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            {classification.missing_information.map((info, i) => (
              <li key={i}>{info}</li>
            ))}
            {classification.missing_information.length === 0 && <span className="text-muted-foreground italic">None</span>}
          </ul>
        </div>
      </div>

      {/* Recommended Action */}
      {recommended_action && (
        <div className="p-4 bg-card rounded-lg border border-border shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs text-primary uppercase tracking-wider mb-1 font-mono">Recommended Action</p>
              <h4 className="text-lg font-semibold">{recommended_action.description}</h4>
            </div>
            {guardrail_result && (
              <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded ${
                guardrail_result.risk_level === 'high' ? 'bg-destructive/20 text-destructive' :
                guardrail_result.risk_level === 'medium' ? 'bg-amber-500/20 text-amber-500' :
                'bg-green-500/20 text-green-500'
              }`}>
                {guardrail_result.risk_level} Risk
              </span>
            )}
          </div>
          
          {guardrail_result && guardrail_result.reasons.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Guardrail Evaluation:</p>
              <ul className="text-sm space-y-1">
                {guardrail_result.reasons.map((reason, i) => (
                  <li key={i} className="flex items-center gap-2 text-amber-500">
                    <span className="w-1 h-1 rounded-full bg-amber-500"></span>
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
