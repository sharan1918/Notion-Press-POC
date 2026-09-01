import { useState, useEffect } from "react";
import EmailList from "./components/EmailList";
import EmailDetail from "./components/EmailDetail";
import PipelineView from "./components/PipelineView";
import type { Email, ProcessingResponse } from "./types";
import { getEmails, processEmail, approveAction, rejectAction, correctClassification, provideInfo } from "./api";

export default function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<Record<string, ProcessingResponse>>({});

  useEffect(() => {
    getEmails().then(data => {
      setEmails(data);
      if (data.length > 0) setSelectedEmailId(data[0].id);
    });
  }, []);

  const selectedEmail = emails.find(e => e.id === selectedEmailId);
  const currentState = selectedEmailId ? processingState[selectedEmailId] : undefined;

  const handleProcess = async (id: string) => {
    // Set temp processing state
    setProcessingState(prev => ({
      ...prev,
      [id]: { thread_id: "", state: { email: emails.find(e => e.id === id)!, final_status: "processing" } as any }
    }));
    
    try {
      const res = await processEmail(id);
      setProcessingState(prev => ({ ...prev, [id]: res }));
    } catch (e) {
      console.error(e);
      // Remove temp state on error
      setProcessingState(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleUpdate = async (id: string, apiCall: Promise<ProcessingResponse>) => {
    // Set processing
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
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      <EmailList 
        emails={emails} 
        selectedEmailId={selectedEmailId} 
        onSelect={setSelectedEmailId} 
        processingState={processingState}
      />
      
      {selectedEmail && (
        <EmailDetail 
          email={selectedEmail}
          processingState={currentState}
          onProcess={handleProcess}
          onApprove={(threadId) => handleUpdate(selectedEmailId!, approveAction(threadId))}
          onReject={(threadId) => handleUpdate(selectedEmailId!, rejectAction(threadId))}
          onCorrect={(threadId, intent, notes) => handleUpdate(selectedEmailId!, correctClassification(threadId, intent, notes))}
          onProvideInfo={(threadId, info, attachments) => handleUpdate(selectedEmailId!, provideInfo(threadId, info, attachments))}
        />
      )}
      
      <div className="w-96 border-l border-border bg-background p-6 overflow-y-auto">
        <PipelineView state={currentState?.state || null} />
      </div>
    </div>
  );
}
