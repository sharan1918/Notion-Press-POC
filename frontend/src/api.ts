import type { Email, ProcessingResponse, HumanCorrection } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

export async function getEmails(): Promise<Email[]> {
  const res = await fetch(`${BASE}/emails`);
  return res.json();
}

export async function processEmail(id: string): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/process/${id}`, { method: "POST" });
  return res.json();
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
  additionalInfo: string
): Promise<ProcessingResponse> {
  const res = await fetch(`${BASE}/provide-info/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ additional_info: additionalInfo }),
  });
  return res.json();
}

export async function getCorrections(): Promise<HumanCorrection[]> {
  const res = await fetch(`${BASE}/corrections`);
  return res.json();
}
