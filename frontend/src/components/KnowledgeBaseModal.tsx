import React, { useState, useEffect, useRef } from "react";
import {
  getKnowledgeStatus,
  getKnowledgeDocuments,
  getKnowledgeChunks,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  clearKnowledgeBase,
  quickSeedSamplePdf,
  testKnowledgeQuery,
  getSamplePdfDownloadUrl,
  type KnowledgeDocument,
  type KnowledgeStatus,
  type KnowledgeChunk,
  type KnowledgeQueryResult
} from "../api";

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKnowledgeUpdated?: () => void;
}

export default function KnowledgeBaseModal({ isOpen, onClose, onKnowledgeUpdated }: KnowledgeBaseModalProps) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [selectedDocChunks, setSelectedDocChunks] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isQuickSeeding, setIsQuickSeeding] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Test query sandbox state
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<KnowledgeQueryResult[] | null>(null);
  const [isTestingQuery, setIsTestingQuery] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [statusData, docsData, chunksData] = await Promise.all([
        getKnowledgeStatus(),
        getKnowledgeDocuments(),
        getKnowledgeChunks(),
      ]);
      setStatus(statusData);
      setDocuments(docsData);
      setChunks(chunksData);
    } catch (err) {
      console.error("Failed to load knowledge base data:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setUploadMessage(null);
      setTestResults(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const allowed = [".pdf", ".txt", ".md"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadMessage({ type: "error", text: `Unsupported file type: ${ext}. Please upload a .pdf, .txt, or .md file.` });
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    try {
      const res = await uploadKnowledgeDocument(file);
      setUploadMessage({
        type: "success",
        text: `Successfully indexed "${res.filename}" (${res.chunks_indexed} semantic chunks extracted)`
      });
      await loadData();
      onKnowledgeUpdated?.();
    } catch (err: any) {
      setUploadMessage({ type: "error", text: err.message || "Failed to upload and parse PDF." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuickSeed = async () => {
    setIsQuickSeeding(true);
    setUploadMessage(null);
    try {
      const res = await quickSeedSamplePdf();
      setUploadMessage({
        type: "success",
        text: `Ingested Notion Press Author Policy Handbook (${res.chunks_indexed} chunks indexed)`
      });
      await loadData();
      onKnowledgeUpdated?.();
    } catch (err: any) {
      setUploadMessage({ type: "error", text: err.message || "Failed to ingest sample PDF." });
    } finally {
      setIsQuickSeeding(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}" and its indexed chunks?`)) return;
    try {
      await deleteKnowledgeDocument(filename);
      setUploadMessage({ type: "success", text: `Deleted "${filename}".` });
      if (selectedDocChunks === filename) setSelectedDocChunks(null);
      await loadData();
      onKnowledgeUpdated?.();
    } catch (err: any) {
      setUploadMessage({ type: "error", text: err.message || "Failed to delete document." });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to clear ALL documents from the RAG knowledge base?")) return;
    try {
      await clearKnowledgeBase();
      setUploadMessage({ type: "success", text: "Knowledge base cleared successfully." });
      setSelectedDocChunks(null);
      setTestResults(null);
      await loadData();
      onKnowledgeUpdated?.();
    } catch (err: any) {
      setUploadMessage({ type: "error", text: err.message || "Failed to clear knowledge base." });
    }
  };

  const handleRunTestQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setIsTestingQuery(true);
    try {
      const res = await testKnowledgeQuery(testQuery.trim(), 3);
      setTestResults(res.results);
    } catch (err: any) {
      alert(err.message || "Query failed");
    } finally {
      setIsTestingQuery(false);
    }
  };

  const filteredChunks = selectedDocChunks 
    ? chunks.filter(c => c.filename === selectedDocChunks)
    : chunks;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-card border border-border w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 7v14" />
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                RAG Knowledge Base
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border font-mono">
                  {status ? `${status.total_documents} Docs · ${status.total_chunks} Chunks` : "Loading..."}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Upload author policy PDFs to ground AI auto-replies with verified guidelines
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Message Alert */}
          {uploadMessage && (
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              uploadMessage.type === "success" 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" 
                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
            }`}>
              <div className="flex items-center gap-2">
                <span>{uploadMessage.type === "success" ? "✓" : "⚠️"}</span>
                <span className="font-medium">{uploadMessage.text}</span>
              </div>
              <button 
                onClick={() => setUploadMessage(null)}
                className="opacity-70 hover:opacity-100 font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Official Notion Press Sample PDF Card */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
                  Official Template
                </span>
                <h4 className="text-xs font-semibold text-foreground">
                  Notion Press Author Publishing Policy Handbook PDF
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground max-w-lg">
                Includes Royalties (100% Net Profit), ISBN Rules, Production SLAs (48-72h), Amazon/Flipkart Distribution Lag, &amp; Author Copies.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={getSamplePdfDownloadUrl()}
                download="Notion_Press_Author_Publishing_Policy_Handbook.pdf"
                className="px-3 py-1.5 bg-card hover:bg-secondary text-foreground border border-border rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PDF
              </a>
              <button
                onClick={handleQuickSeed}
                disabled={isQuickSeeding}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isQuickSeeding ? (
                  <>
                    <span className="animate-spin text-xs">⏳</span> Indexing...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    1-Click Ingest
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              isDragging 
                ? "border-foreground/60 bg-secondary/40 scale-[0.99]" 
                : "border-border hover:border-foreground/30 hover:bg-muted/30"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
              accept=".pdf,.txt,.md"
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                {isUploading ? (
                  <span className="animate-spin text-base">⏳</span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                    <path d="M12 12v9"/>
                    <path d="m16 16-4-4-4 4"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {isUploading ? "Extracting text & creating semantic chunks..." : "Click to upload or drag & drop policy PDF"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Supports PDF documents, TXT, and Markdown files (up to 20 MB)
                </p>
              </div>
            </div>
          </div>

          {/* Indexed Documents Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Indexed Policy Documents ({documents.length})
              </h3>
              {documents.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-red-600 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                  Clear Knowledge Base
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="p-6 border border-border rounded-xl bg-muted/20 text-center space-y-1">
                <p className="text-xs font-medium text-muted-foreground">No policy documents indexed in RAG yet</p>
                <p className="text-[11px] text-muted-foreground">
                  Upload a custom PDF or click <strong>1-Click Ingest</strong> above to test grounded auto-replies.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.filename}
                    className="border border-border rounded-lg bg-card p-3 flex flex-col gap-2 hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{doc.filename}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Indexed: {doc.uploaded_at}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground/80 border border-border font-mono">
                          {doc.chunk_count} Chunks
                        </span>
                        <button
                          onClick={() => setSelectedDocChunks(selectedDocChunks === doc.filename ? null : doc.filename)}
                          className="px-2 py-1 text-[11px] rounded bg-secondary hover:bg-muted text-secondary-foreground transition-colors cursor-pointer border border-border"
                        >
                          {selectedDocChunks === doc.filename ? "Hide Chunks ▲" : "View Chunks ▼"}
                        </button>
                        <button
                          onClick={() => handleDelete(doc.filename)}
                          className="w-7 h-7 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete document"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Expanded Chunk Previews */}
                    {selectedDocChunks === doc.filename && (
                      <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          Extracted Semantic Chunks ({filteredChunks.length}):
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {filteredChunks.map((chunk, idx) => (
                            <div key={chunk.id || idx} className="p-2 rounded bg-muted/40 border border-border/40 text-[11px] space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-foreground truncate">{chunk.title}</span>
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                                  {chunk.intent}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {chunk.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive RAG Retrieval Sandbox */}
          <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
                <span className="text-xs font-bold text-foreground">RAG Query Sandbox</span>
                <span className="text-[10px] text-muted-foreground">(Test vector similarity search)</span>
              </div>
            </div>

            <form onSubmit={handleRunTestQuery} className="flex gap-2">
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="e.g. How much royalty do I earn and when is payout?"
                className="flex-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-foreground/30 text-foreground"
              />
              <button
                type="submit"
                disabled={isTestingQuery || !testQuery.trim() || documents.length === 0}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors shrink-0"
              >
                {isTestingQuery ? "Searching..." : "Test Query"}
              </button>
            </form>

            {/* Test Results Display */}
            {testResults !== null && (
              <div className="space-y-2 pt-2 border-t border-border/60">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Retrieved {testResults.length} Relevant Policy Chunk(s):
                </p>
                {testResults.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No matching chunks found in knowledge base.</p>
                ) : (
                  <div className="space-y-2">
                    {testResults.map((r, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-card border border-border text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground">{r.title}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border font-semibold">
                            Similarity: {Math.round(r.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line">
                          {r.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/30">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${status?.chroma_connected ? "bg-emerald-500" : "bg-amber-500"}`}></span>
            ChromaDB Vector Store: {status?.chroma_connected ? "Online" : "In-Memory Mode"}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-secondary hover:bg-muted text-secondary-foreground rounded-lg text-xs font-medium transition-colors cursor-pointer border border-border"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
