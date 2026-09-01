import type { Email, ProcessingResponse } from "../types";
import ProcessingResult from "./ProcessingResult";
import HumanApproval from "./HumanApproval";
import MissingInfoForm from "./MissingInfoForm";

interface Props {
  email: Email;
  processingState?: ProcessingResponse;
  onProcess: (id: string) => void;
  onApprove: (threadId: string) => void;
  onReject: (threadId: string) => void;
  onCorrect: (threadId: string, intent: string, notes: string) => void;
  onProvideInfo: (threadId: string, info: string, attachments: string[]) => void;
}

export default function EmailDetail({ 
  email, processingState, onProcess, onApprove, onReject, onCorrect, onProvideInfo 
}: Props) {
  const isProcessing = processingState?.state.final_status === "processing";
  const state = processingState?.state;
  const threadId = processingState?.thread_id;

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-lg font-medium">
              {email.sender_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{email.sender_name}</h2>
              <p className="text-sm text-muted-foreground">{email.sender}</p>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {new Date(email.timestamp).toLocaleString()}
            </div>
          </div>
          
          <h1 className="text-2xl font-bold mb-6">{email.subject}</h1>
          <div className="p-6 bg-card rounded-lg border border-border shadow-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {email.body}
          </div>
        </div>

        {!state && !isProcessing && (
          <div className="flex justify-center mt-12">
            <button 
              onClick={() => onProcess(email.id)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 flex items-center gap-2"
            >
              <span className="text-xl">🤖</span> Process with AI
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="mt-8 p-6 bg-card border border-border rounded-lg animate-shimmer">
            <div className="h-6 w-1/3 bg-background/50 rounded mb-4"></div>
            <div className="h-4 w-full bg-background/50 rounded mb-2"></div>
            <div className="h-4 w-2/3 bg-background/50 rounded"></div>
          </div>
        )}

        {state && !isProcessing && (
          <div className="mt-8 border-t border-border pt-8">
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <span>🤖</span> AI Analysis
            </h3>
            
            <ProcessingResult state={state} />
            
            {state.final_status === "pending_approval" && threadId && (
              <HumanApproval 
                state={state}
                onApprove={() => onApprove(threadId)}
                onReject={() => onReject(threadId)}
                onCorrect={(intent, notes) => onCorrect(threadId, intent, notes)}
              />
            )}
            
            {state.final_status === "pending_info" && threadId && state.classification?.missing_information && (
              <MissingInfoForm 
                missingInfo={state.classification.missing_information}
                onSubmit={(info, attachments) => onProvideInfo(threadId, info, attachments)}
              />
            )}
            
            {state.final_status === "executed" && (
              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-500 font-medium flex items-center gap-2 animate-fadeIn">
                <span>✅</span> Action successfully executed.
              </div>
            )}
            
            {state.final_status === "rejected" && (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive font-medium flex items-center gap-2 animate-fadeIn">
                <span>❌</span> Action was rejected and workflow terminated.
              </div>
            )}
            
            {state.final_status === "error" && (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive font-medium flex items-center gap-2 animate-fadeIn">
                <span>⚠️</span> Processing failed after retries. Routed to manual review.
              </div>
            )}
            
            {state.final_status === "manual_review" && (
              <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-500 font-medium flex items-center gap-2 animate-fadeIn">
                <span>⚠️</span> Max corrections reached. Routed to manual review.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
