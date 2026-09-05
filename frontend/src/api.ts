import type { Email, ProcessingResponse, HumanCorrection, CreateEmailPayload } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const API_KEY = (import.meta.env.VITE_API_KEY as string) || "notion-poc-author-key-2026";

export async function getEmails(): Promise<Email[]> {
  const res = await fetch(`${BASE}/emails`);
  return res.json();
}

export async function createEmail(emailData: CreateEmailPayload): Promise<Email> {
  const res = await fetch(`${BASE}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
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

  // Poll for job updates progressively in real time as each email finishes
  const jobId = data.job_id;
  const pollInterval = 400; // 400ms for snappy per-email UI updates
  const maxAttempts = 200; // up to 80 seconds
  
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

// ── Knowledge Base (RAG) APIs ──────────────────────────────────────────────

export interface KnowledgeDocument {
  filename: string;
  chunk_count: number;
  uploaded_at: string;
}

export interface KnowledgeStatus {
  total_documents: number;
  total_chunks: number;
  documents: KnowledgeDocument[];
  chroma_connected: boolean;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  title: string;
  filename: string;
  intent: string;
}

export interface KnowledgeQueryResult {
  title: string;
  intent: string;
  filename: string;
  content: string;
  similarity_score: number;
}

export async function getKnowledgeStatus(): Promise<KnowledgeStatus> {
  const res = await fetch(`${BASE}/knowledge/status`);
  if (!res.ok) throw new Error("Failed to fetch knowledge base status");
  return res.json();
}

export async function getKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const res = await fetch(`${BASE}/knowledge/documents`);
  if (!res.ok) throw new Error("Failed to list knowledge documents");
  return res.json();
}

export async function getKnowledgeChunks(filename?: string): Promise<KnowledgeChunk[]> {
  const url = filename ? `${BASE}/knowledge/chunks?filename=${encodeURIComponent(filename)}` : `${BASE}/knowledge/chunks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch knowledge chunks");
  return res.json();
}

export async function uploadKnowledgeDocument(file: File): Promise<{
  success: boolean;
  filename: string;
  chunks_indexed: number;
  chunks: Array<{ title: string; intent: string; preview: string }>;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE}/knowledge/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
}

export async function deleteKnowledgeDocument(filename: string): Promise<{
  success: boolean;
  deleted_chunks: number;
  status: KnowledgeStatus;
}> {
  const res = await fetch(`${BASE}/knowledge/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete knowledge document");
  return res.json();
}

export async function clearKnowledgeBase(): Promise<{
  success: boolean;
  cleared_chunks: number;
  status: KnowledgeStatus;
}> {
  const res = await fetch(`${BASE}/knowledge/clear`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to clear knowledge base");
  return res.json();
}

export async function quickSeedSamplePdf(): Promise<{
  success: boolean;
  filename: string;
  chunks_indexed: number;
  status: KnowledgeStatus;
}> {
  const res = await fetch(`${BASE}/knowledge/quick-seed-sample`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to quick-seed sample PDF");
  return res.json();
}

export async function testKnowledgeQuery(query: string, top_k: number = 2): Promise<{
  query: string;
  results_count: number;
  results: KnowledgeQueryResult[];
}> {
  const res = await fetch(`${BASE}/knowledge/test-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k }),
  });
  if (!res.ok) throw new Error("Failed to execute test query");
  return res.json();
}

export function getSamplePdfDownloadUrl(): string {
  return `${BASE}/knowledge/sample-pdf`;
}
