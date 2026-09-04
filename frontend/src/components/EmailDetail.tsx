import type { Email, ProcessingResponse } from "../types";
import ProcessingResult from "./ProcessingResult";
import HumanApproval from "./HumanApproval";
import MissingInfoForm from "./MissingInfoForm";
import FormattedText from "./FormattedText";

interface Props {
  email: Email;
  processingState?: ProcessingResponse;
  isStreaming?: boolean;
  onProcess: (id: string) => void;
  onApprove: (threadId: string) => void;
  onReject: (threadId: string) => void;
  onCorrect: (threadId: string, intent: string, notes: string) => void;
  onProvideInfo: (threadId: string, info: string, attachments: string[]) => void;
  onBackToInbox?: () => void;
  onViewPipeline?: () => void;
}

// Avatar color helper
const avatarColors = [
  "bg-amber-700 text-amber-100",
  "bg-purple-700 text-purple-100",
  "bg-blue-700 text-blue-100",
  "bg-emerald-700 text-emerald-100",
  "bg-rose-700 text-rose-100",
  "bg-cyan-700 text-cyan-100",
  "bg-indigo-700 text-indigo-100",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return avatarColors[hash % avatarColors.length];
}

export default function EmailDetail({ 
  email, 
  processingState, 
  isStreaming = false,
  onProcess, 
  onApprove, 
  onReject, 
  onCorrect, 
  onProvideInfo,
  onBackToInbox,
  onViewPipeline
}: Props) {
  const state = processingState?.state;
  const threadId = processingState?.thread_id;
  const isProcessing = isStreaming || state?.final_status === "processing";

  const parts = email.sender_name.trim().split(" ");
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2);
  const avatarColor = getAvatarColor(email.sender_name);

  return (
    <div className="flex-1 overflow-y-auto bg-background flex flex-col h-full">
      {/* Top Action Ribbon (Outlook Style) */}
      <div className="border-b border-border bg-card px-3 sm:px-6 py-2.5 flex items-center justify-between shrink-0 select-none gap-2">
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-semibold text-muted-foreground">
          {/* Mobile Back Button */}
          {onBackToInbox && (
            <button 
              onClick={onBackToInbox}
              className="md:hidden text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer mr-1"
            >
              <span>←</span> Inbox
            </button>
          )}

          <button className="hover:text-foreground flex items-center gap-1.5 cursor-pointer transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            <span className="hidden sm:inline">Reply</span>
          </button>
          <button className="hover:text-foreground hidden sm:flex items-center gap-1.5 cursor-pointer transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="7 17 2 12 7 7" />
              <polyline points="12 17 7 12 12 7" />
              <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
            </svg>
            <span>Reply all</span>
          </button>
          <button className="hover:text-foreground hidden sm:flex items-center gap-1.5 cursor-pointer transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="15 17 20 12 15 7" />
              <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
            </svg>
            <span>Forward</span>
          </button>
        </div>

        {/* AI Action Trigger & Live Status */}
        <div className="flex items-center gap-2">
          {/* Mobile Shortcut to view AI Pipeline */}
          {onViewPipeline && (
            <button 
              onClick={onViewPipeline}
              className="lg:hidden bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-2 py-1 rounded text-xs font-mono flex items-center gap-1 cursor-pointer"
              title="View AI Pipeline DAG"
            >
              <span>⚡</span>
              <span className="hidden sm:inline">Pipeline</span>
            </button>
          )}

          {isProcessing ? (
            <span className="text-xs text-primary font-mono flex items-center gap-2 px-2.5 py-1 bg-primary/10 rounded-md border border-primary/20">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              <span className="font-semibold text-[11px] sm:text-xs">Triaging...</span>
            </span>
          ) : state ? (
            <button 
              onClick={() => onProcess(email.id)}
              className="bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border px-2 py-1 sm:px-2.5 sm:py-1 rounded text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
              title="Re-run AI pipeline"
            >
              <span>🔄</span>
              <span className="hidden sm:inline">Re-analyze</span>
            </button>
          ) : (
            <button 
              onClick={() => onProcess(email.id)}
              className="bg-secondary/70 hover:bg-secondary text-foreground hover:text-primary hover:border-primary/40 border border-border px-2.5 py-1 sm:px-3 sm:py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <span className="text-sm">🤖</span>
              <span>Process</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Email Viewport */}
      <div className="p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-4xl">
        {/* Subject Header */}
        <h1 className="text-base sm:text-lg md:text-xl font-bold text-foreground tracking-tight break-words">
          {email.subject}
        </h1>

        {/* Sender Info Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 sm:mt-0 ${avatarColor}`}>
              {initials.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs sm:text-sm font-bold text-foreground truncate">{email.sender_name}</span>
                <span className="text-[11px] sm:text-xs text-muted-foreground truncate">&lt;{email.sender}&gt;</span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">To: Notion Press Support &lt;support@notionpress.com&gt;</p>
            </div>
          </div>

          <div className="text-[11px] sm:text-xs text-muted-foreground font-mono shrink-0 pl-11 sm:pl-0">
            {new Date(email.timestamp).toLocaleString(undefined, { 
              weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' 
            })}
          </div>
        </div>

        {/* Attachment Pill (If any) */}
        {state?.attachments && state.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 pb-2">
            {state.attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary border border-border text-xs font-mono">
                <span>📄</span>
                <span className="font-medium text-foreground">{att}</span>
                <span className="text-muted-foreground text-[10px]">34 KB ▾</span>
              </div>
            ))}
          </div>
        )}

        {/* Email Body Text */}
        <div className="text-xs md:text-sm text-foreground leading-relaxed font-sans pt-2 border-t border-border/40">
          <FormattedText content={email.body} />
        </div>

        {/* Bottom Quick Action Buttons */}
        <div className="flex items-center gap-2.5 pt-4 border-t border-border/40">
          <button className="px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium text-foreground flex items-center gap-1.5 transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            <span>Reply</span>
          </button>
          <button className="px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium text-foreground flex items-center gap-1.5 transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="7 17 2 12 7 7" />
              <polyline points="12 17 7 12 12 7" />
              <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
            </svg>
            <span>Reply all</span>
          </button>
          <button className="px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium text-foreground flex items-center gap-1.5 transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="15 17 20 12 15 7" />
              <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
            </svg>
            <span>Forward</span>
          </button>
        </div>

        {/* --- AI Triage Copilot Section --- */}
        {isProcessing && !state?.classification && (
          <div className="mt-8 pt-6 border-t-2 border-border/80 space-y-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold font-mono text-primary uppercase">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                <span>Connecting to LangGraph AI Pipeline...</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">Streaming nodes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="h-20 bg-secondary/50 rounded-xl border border-border/60"></div>
              <div className="h-20 bg-secondary/50 rounded-xl border border-border/60"></div>
              <div className="h-20 bg-secondary/50 rounded-xl border border-border/60"></div>
            </div>
            <div className="h-24 bg-secondary/30 rounded-xl border border-border/60"></div>
          </div>
        )}

        {state && state.classification && (
          <div className="mt-8 pt-6 border-t-2 border-border/80 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-primary flex items-center gap-1.5">
                <span>⚡</span> AI Triage Intelligence {isProcessing && <span className="text-[10px] text-primary lowercase animate-pulse font-normal">(streaming...)</span>}
              </h3>
              {threadId && <span className="text-[10px] font-mono text-muted-foreground">Thread: {threadId}</span>}
            </div>

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
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-500 font-semibold text-xs flex items-center gap-2">
                <span>✅</span> Action executed by deterministic policy engine.
              </div>
            )}
            
            {state.final_status === "rejected" && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-500 font-semibold text-xs flex items-center gap-2">
                <span>❌</span> Action rejected by support agent. Workflow terminated.
              </div>
            )}

            {state.final_status === "error" && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-500 font-semibold text-xs flex items-center gap-2">
                <span>⚠️</span> Processing failed after retries. Routed to manual review.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
