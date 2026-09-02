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
  provideInfo 
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

  // Initial load
  useEffect(() => {
    getEmails().then(data => {
      setEmails(data);
      if (data.length > 0) {
        setSelectedEmailId(data[0].id);
      }
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden transition-colors duration-300">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <EmailList 
          emails={emails} 
          selectedEmailId={selectedEmailId} 
          onSelect={setSelectedEmailId} 
          processingState={processingState}
          streamingIds={streamingIds}
        />
        
        {selectedEmail && (
          <EmailDetail 
            email={selectedEmail}
            processingState={currentState}
            isStreaming={isSelectedStreaming}
            onProcess={(id) => startStreaming(id, true)}
            onApprove={(threadId) => handleUpdate(selectedEmailId!, approveAction(threadId))}
            onReject={(threadId) => handleUpdate(selectedEmailId!, rejectAction(threadId))}
            onCorrect={(threadId, intent, notes) => handleUpdate(selectedEmailId!, correctClassification(threadId, intent, notes))}
            onProvideInfo={(threadId, info, attachments) => handleUpdate(selectedEmailId!, provideInfo(threadId, info, attachments))}
          />
        )}
        
        <div className="w-96 border-l border-border bg-card p-6 overflow-y-auto">
          <PipelineView 
            state={currentState?.state || null} 
            isStreaming={isSelectedStreaming}
          />
        </div>
      </div>
    </div>
  );
}
