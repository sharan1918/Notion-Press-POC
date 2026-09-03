import { useState, useEffect, useRef, useCallback } from "react";
import Header from "./components/Header";
import EmailList from "./components/EmailList";
import EmailDetail from "./components/EmailDetail";
import PipelineView from "./components/PipelineView";
import type { Email, ProcessingResponse } from "./types";
import { 
  getEmails, 
  streamProcessEmail, 
  approveAction, 
  rejectAction, 
  correctClassification, 
  provideInfo,
  triageAllEmails 
} from "./api";

export default function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<Record<string, ProcessingResponse>>({});
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const abortControllersRef = useRef<Record<string, () => void>>({});

  const startStreaming = useCallback((id: string, force: boolean = false) => {
    // If not forced and already cached, skip
    if (!force && processingState[id]?.state?.final_status && processingState[id].state.final_status !== "processing") {
      return;
    }

    const emailObj = emails.find(e => e.id === id) || processingState[id]?.state?.email;
    if (!emailObj) {
      console.warn(`Cannot start stream: Email with ID ${id} not found.`);
      return;
    }

    // Cancel existing stream for this id if any
    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id]();
      delete abortControllersRef.current[id];
    }

    // Mark as streaming
    setStreamingIds(prev => new Set(prev).add(id));

    // Initialize/reset placeholder state
    setProcessingState(prev => {
      return {
        ...prev,
        [id]: {
          thread_id: prev[id]?.thread_id || "",
          state: {
            email: emailObj,
            final_status: "processing",
            processing_log: ["Initiating real-time AI triage pipeline..."]
          }
        }
      };
    });

    const cancel = streamProcessEmail(
      id,
      (update: ProcessingResponse) => {
        setProcessingState(prev => ({
          ...prev,
          [id]: {
            ...update,
            state: {
              ...prev[id]?.state,
              ...update.state,
              // Merge logs cleanly
              processing_log: update.state.processing_log || prev[id]?.state?.processing_log
            }
          }
        }));
      },
      () => {
        setStreamingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (abortControllersRef.current[id] === cancel) {
          delete abortControllersRef.current[id];
        }
      },
      (err) => {
        console.error("Stream error for", id, err);
        setStreamingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (abortControllersRef.current[id] === cancel) {
          delete abortControllersRef.current[id];
        }
      }
    );

    abortControllersRef.current[id] = cancel;
  }, [emails]);

  // Initial load + background auto-triage
  useEffect(() => {
    getEmails().then(data => {
      setEmails(data);
      if (data.length > 0) {
        setSelectedEmailId(data[0].id);
      }

      // Initialize placeholder "processing" state for all emails immediately
      // so users see active progress indicators right away
      setProcessingState(prev => {
        const initialMap: Record<string, ProcessingResponse> = { ...prev };
        data.forEach((email: Email) => {
          if (!initialMap[email.id]) {
            initialMap[email.id] = {
              thread_id: "",
              state: {
                email,
                final_status: "processing",
                processing_log: ["Queued for AI triage..."]
              }
            };
          }
        });
        return initialMap;
      });

      // Fire batch auto-triage in background (intake filter catches spam instantly)
      const emailIds = data.map((e: { id: string }) => e.id);
      triageAllEmails(emailIds, (partialResults) => {
        setProcessingState(prev => {
          const merged = { ...prev };
          for (const [emailId, result] of Object.entries(partialResults)) {
            if (!prev[emailId] || prev[emailId]?.state?.final_status === "processing") {
              merged[emailId] = result;
            }
          }
          return merged;
        });
      }).catch(err => {
        console.warn("Background triage failed (non-blocking):", err);
      });
    });
  }, []);

  // Auto-trigger streaming when an un-analyzed email is selected
  useEffect(() => {
    if (!selectedEmailId || emails.length === 0) return;

    const alreadyProcessed = processingState[selectedEmailId];
    const isCurrentlyStreaming = streamingIds.has(selectedEmailId);

    if (!alreadyProcessed && !isCurrentlyStreaming) {
      startStreaming(selectedEmailId, false);
    }
  }, [selectedEmailId, emails, processingState, streamingIds, startStreaming]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach(cancel => cancel());
    };
  }, []);

  const selectedEmail = emails.find(e => e.id === selectedEmailId);
  const currentState = selectedEmailId ? processingState[selectedEmailId] : undefined;
  const isSelectedStreaming = selectedEmailId ? streamingIds.has(selectedEmailId) : false;

  const handleUpdate = async (id: string, apiCall: Promise<ProcessingResponse>) => {
    setProcessingState(prev => ({
      ...prev,
      [id]: { ...prev[id], state: { ...prev[id].state, final_status: "processing" } }
    }));
    
    try {
      const res = await apiCall;
      setProcessingState(prev => ({ ...prev, [id]: res }));
    } catch (e) {
      console.error(e);
    }
  };

  const [mobileTab, setMobileTab] = useState<"inbox" | "detail" | "pipeline">("inbox");

  const handleSelectEmail = (id: string) => {
    setSelectedEmailId(id);
    setMobileTab("detail");
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-full bg-background text-foreground overflow-hidden transition-colors duration-300">
      <Header />
      
      {/* Main Content Area: Responsive Mobile Stack / Desktop Multi-Column */}
      <div className="flex flex-1 w-full overflow-hidden relative">
        {/* Email List Column: Base Layer (Always rendered, full width on mobile) */}
        <div className="flex w-full md:w-80 lg:w-88 shrink-0 flex-col h-full border-r border-border bg-card overflow-hidden">
          <EmailList 
            emails={emails} 
            selectedEmailId={selectedEmailId} 
            onSelect={handleSelectEmail} 
            processingState={processingState}
            streamingIds={streamingIds}
          />
        </div>
        
        {/* Email Detail Column: Slide-over Layer 1 on mobile, Column 2 on desktop */}
        <div className={`
          absolute inset-0 z-10 bg-background transition-transform duration-300 ease-in-out
          ${mobileTab === "inbox" ? "translate-x-full" : "translate-x-0"}
          md:relative md:translate-x-0 md:flex md:flex-1 md:flex-col md:h-full md:overflow-hidden md:min-w-0 md:z-auto
        `}>
          {selectedEmail ? (
            <EmailDetail 
              email={selectedEmail}
              processingState={currentState}
              isStreaming={isSelectedStreaming}
              onProcess={(id) => startStreaming(id, true)}
              onApprove={(threadId) => handleUpdate(selectedEmailId!, approveAction(threadId))}
              onReject={(threadId) => handleUpdate(selectedEmailId!, rejectAction(threadId))}
              onCorrect={(threadId, intent, notes) => handleUpdate(selectedEmailId!, correctClassification(threadId, intent, notes))}
              onProvideInfo={(threadId, info, attachments) => handleUpdate(selectedEmailId!, provideInfo(threadId, info, attachments))}
              onBackToInbox={() => setMobileTab("inbox")}
              onViewPipeline={() => setMobileTab("pipeline")}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-sm space-y-2">
              <span className="text-3xl">📬</span>
              <p className="font-semibold text-foreground">No Email Selected</p>
              <p className="text-xs max-w-xs">Select an email from the inbox to view details and AI triage actions.</p>
              <button 
                onClick={() => setMobileTab("inbox")} 
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold md:hidden"
              >
                Go to Inbox
              </button>
            </div>
          )}
        </div>
        
        {/* Pipeline View Column: Slide-over Layer 2 on mobile, Column 3 on desktop */}
        <div className={`
          absolute inset-0 z-20 bg-card transition-transform duration-300 ease-in-out
          ${mobileTab === "pipeline" ? "translate-x-0" : "translate-x-full"}
          lg:relative lg:translate-x-0 lg:flex lg:w-96 lg:shrink-0 lg:border-l lg:border-border lg:p-4 lg:sm:p-6 lg:overflow-y-auto lg:flex-col lg:h-full lg:z-auto
        `}>
          {/* Mobile Back Button inside Pipeline View */}
          <div className="flex items-center justify-between mb-4 md:hidden pb-3 border-b border-border">
            <button 
              onClick={() => setMobileTab("detail")} 
              className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>←</span> Back to Email
            </button>
            <span className="text-xs font-mono font-bold text-muted-foreground">AI Pipeline View</span>
          </div>

          <PipelineView 
            state={currentState?.state || null} 
            isStreaming={isSelectedStreaming}
          />
        </div>
      </div>
    </div>
  );
}
