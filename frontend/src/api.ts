import type { Email, ProcessingResponse, HumanCorrection } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function getEmails(): Promise<Email[]> {
  const res = await fetch(`${BASE}/emails`);
  return res.json();
}

export async function createEmail(emailData: {
  sender_name: string;
  sender: string;
  subject: string;
  body: string;
}): Promise<Email> {
  const res = await fetch(`${BASE}/emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(emailData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create email (${res.status})`);
  }
  return res.json();
}

export async function processEmail(id: string): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/process/${id}`, { method: "POST" });
  return res.json();
}

export function streamProcessEmail(
  id: string,
  onUpdate: (data: ProcessingResponse) => void,
  onComplete?: () => void,
  onError?: (err: any) => void
): () => void {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    onError?.(new Error("Stream connection timed out after 70s"));
  }, 70000);

  (async () => {
    try {
      const response = await fetch(`${BASE}/process-stream/${id}`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") {
              clearTimeout(timeoutId);
              onComplete?.();
              return;
            }
            try {
              const parsed: ProcessingResponse = JSON.parse(dataStr);
              onUpdate(parsed);
            } catch (err) {
              console.error("Error parsing SSE JSON:", err);
            }
          }
        }
      }
      clearTimeout(timeoutId);
      onComplete?.();
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name !== "AbortError") {
        console.error("SSE stream error:", err);
        onError?.(err);
      }
    }
  })();

  return () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
}

export async function approveAction(threadId: string): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/approve/${threadId}`, { method: "POST" });
  return res.json();
}

export async function rejectAction(threadId: string): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/reject/${threadId}`, { method: "POST" });
  return res.json();
}

export async function correctClassification(
  threadId: string,
  correctedIntent: string,
  notes: string
): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/correct/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ corrected_intent: correctedIntent, notes }),
  });
  return res.json();
}

export async function provideInfo(
  threadId: string,
  additionalInfo: string,
  attachments: string[] = []
): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/provide-info/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ additional_info: additionalInfo, attachments }),
  });
  return res.json();
}

export async function getCorrections(): Promise<HumanCorrection[]> {
  const res = await fetch(`${BASE}/corrections`);
  return res.json();
}

export async function triageAllEmails(
  emailIds: string[] = [],
  onProgress?: (results: Record<string, ProcessingResponse>) => void
): Promise<Record<string, ProcessingResponse>> {
  const res = await fetch(`${BASE}/triage-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_ids: emailIds }),
  });
  const data = await res.json();
  
  // If the endpoint returned immediate results (backwards compatibility)
  if (!data.job_id) {
    if (onProgress) onProgress(data);
    return data;
  }

  // Poll for job updates progressively
  const jobId = data.job_id;
  const pollInterval = 1000;
  const maxAttempts = 90; // up to 90 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    try {
      const statusRes = await fetch(`${BASE}/triage-status/${jobId}`);
      if (!statusRes.ok) continue;
      const jobData = await statusRes.json();
      
      if (jobData.results && Object.keys(jobData.results).length > 0 && onProgress) {
        onProgress(jobData.results);
      }

      if (jobData.status === "completed") {
        return jobData.results || {};
      }
    } catch {
      // Continue polling on transient errors
    }
  }

  return {};
}
