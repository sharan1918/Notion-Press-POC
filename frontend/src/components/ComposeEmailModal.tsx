import { useState, useEffect, useRef, useMemo } from "react";
import type { Email, CreateEmailPayload } from "../types";
import { createEmail } from "../api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEmailCreated: (email: Email) => void;
  initialData?: Partial<CreateEmailPayload>;
}

export type PresetCategory = "all" | "rag" | "triage" | "custom";

export interface Preset {
  id: string;
  label: string;
  icon: string;
  category: "rag" | "triage" | "custom";
  badge: string;
  badgeType: "rag" | "triage" | "custom";
  description: string;
  sender_name: string;
  sender: string;
  subject: string;
  body: string;
  targetExplanation: string;
}

const PRESETS: Preset[] = [
  // ── RAG Knowledge Base Presets ─────────────────────────────────────────────
  {
    id: "rag-publishing-roadmap",
    label: "Publishing Steps & SLA",
    icon: "📖",
    category: "rag",
    badge: "RAG Grounded",
    badgeType: "rag",
    description: "5-step roadmap, trim sizes (5x8, 6x9, A5) & 7-14d launch timeline",
    sender_name: "Aditi Sen",
    sender: "aditi.sen@example.com",
    subject: "Inquiry on Notion Press publishing steps, supported trim sizes, and launch timeline",
    body: "Hello Notion Press Support,\n\nI have completed my manuscript in Microsoft Word format and would like to understand your self-publishing process. What are the supported book trim sizes and formats, what are the steps from file upload to final galley proof approval, and how many business days does the standard publishing process take?\n\nThanks,\nAditi",
    targetExplanation: "Tests RAG retrieval from 'Notion Press Self-Publishing Roadmap & Steps' to ground auto-reply with verified trim sizes and 7-14 days timeline.",
  },
  {
    id: "rag-amazon-slas",
    label: "Amazon Go-Live SLAs",
    icon: "⏱️",
    category: "rag",
    badge: "RAG Grounded",
    badgeType: "rag",
    description: "Post-proof SLAs: Notion Press store (3-5d), Amazon (7-14d), Out of Stock sync",
    sender_name: "Rahul Menon",
    sender: "rahul.menon@example.com",
    subject: "Go-live timeline post proof approval and Amazon out-of-stock query",
    body: "Hi Support Team,\n\nI approved the digital galley proof for my paperback three days ago. When will the book go live for purchase on the Notion Press Store and Amazon.in? Also, my Amazon listing currently shows 'Temporarily Out of Stock'—could you clarify why this happens and when customer ordering will be available?\n\nBest regards,\nRahul Menon",
    targetExplanation: "Tests RAG retrieval from 'Production Turnaround & Go-Live SLAs' to explain the 24-48h retailer inventory sync and 7-14d syndication.",
  },
  {
    id: "rag-global-distribution",
    label: "Global POD & Distribution",
    icon: "🌍",
    category: "rag",
    badge: "RAG Grounded",
    badgeType: "rag",
    description: "150+ countries via Amazon US/UK & IngramSpark, POD 48h printing & indexing lag",
    sender_name: "Siddharth Roy",
    sender: "siddharth.roy@example.com",
    subject: "International distribution setup for Amazon US/UK and POD turnaround",
    body: "Hello Notion Press Team,\n\nMy paperback is already active in India, but I would like to confirm how international distribution works across 150+ countries through Amazon.com (US/UK) and IngramSpark. How does your Print-on-Demand (POD) model handle international orders, and what is the typical retailer search indexing lag?\n\nThanks,\nSiddharth",
    targetExplanation: "Tests RAG retrieval from 'Distribution Channels & Marketplace Catalog Indexing' for 150+ countries global reach and 48hr POD manufacturing.",
  },
  {
    id: "rag-royalty-rates",
    label: "Royalty Rates & Rights",
    icon: "💡",
    category: "rag",
    badge: "RAG Grounded",
    badgeType: "rag",
    description: "100% Net Profit formula, 10th-of-month payout, ₹1,000 threshold & full copyright",
    sender_name: "Meenakshi Sundaram",
    sender: "meenakshi.s@example.com",
    subject: "Question regarding author profit calculation, payout schedule, and copyright",
    body: "Dear Notion Press,\n\nCould you explain how the 100% Net Author Profit is calculated from MRP and printing costs? Also, what is the minimum payout threshold, on which date of the month are royalties credited to bank accounts, and do I retain 100% intellectual property and copyright for my book?\n\nWarm regards,\nMeenakshi",
    targetExplanation: "Tests RAG retrieval from 'Author Royalty Calculation & Payout Schedule' citing the exact profit formula and ₹1,000 threshold.",
  },
  {
    id: "rag-isbn-policy",
    label: "Free ISBN & Barcodes",
    icon: "🏷️",
    category: "rag",
    badge: "RAG Grounded",
    badgeType: "rag",
    description: "Free 13-digit ISBN, Raja Rammohun Roy agency, EAN-13 barcode & edition revisions",
    sender_name: "Dr. Arvind Swamy",
    sender: "arvind.swamy@example.com",
    subject: "ISBN allocation guidelines, back cover barcodes, and manuscript revisions",
    body: "Hi Support,\n\nDoes Notion Press provide free 13-digit ISBNs for paperback and eBook editions, and how is the EAN-13 barcode formatted on the back cover? Also, if I revise more than 20% of my manuscript after publishing, do I need to register a new ISBN?\n\nRegards,\nDr. Arvind Swamy",
    targetExplanation: "Tests RAG retrieval from 'ISBN Allocation & Barcode Guidelines' verifying free ISBN assignment and >20% revision rules.",
  },

  // ── Operations & Triage Presets ───────────────────────────────────────────
  {
    id: "triage-royalties",
    label: "Royalty Payout Delay",
    icon: "💰",
    category: "triage",
    badge: "Finance Route",
    badgeType: "triage",
    description: "High urgency billing dispute triggering Finance routing & human approval",
    sender_name: "Amitav Ghosh",
    sender: "amitav.ghosh@example.com",
    subject: "Royalty report mismatch and delayed payout for Q2",
    body: "Dear Notion Press Support,\n\nI reviewed my royalty dashboard for the second quarter and noticed that sales from Flipkart have not been reconciled. Furthermore, my payout was scheduled for the 10th but has not arrived in my registered bank account. Could you please investigate and share the breakdown?",
    targetExplanation: "Tests high-urgency financial classification ('royalty_payment') triggering Finance routing and Human-in-the-Loop review.",
  },
  {
    id: "triage-printing",
    label: "Print Quality Issue",
    icon: "📦",
    category: "triage",
    badge: "QA Escalation",
    badgeType: "triage",
    description: "Defective physical copies requiring QA escalation & photo proof upload",
    sender_name: "Kavita Rao",
    sender: "kavita.rao@example.com",
    subject: "URGENT: Defective print copies - Binding is peeling off",
    body: "Hello,\n\nI just received the consignment of 50 author copies of 'Shadows of Dusk'. Unfortunately, more than 15 copies have peeling spine binding and several pages have ink smudges on chapters 3 and 4. Please arrange a replacement batch immediately as my book launch is next week.",
    targetExplanation: "Tests defect classification ('printing_issue') triggering Operations QA escalation and missing proof attachment evaluation.",
  },
  {
    id: "triage-isbn",
    label: "ISBN / Metadata Change",
    icon: "🏷️",
    category: "triage",
    badge: "High Risk Ops",
    badgeType: "triage",
    description: "Metadata mismatch triggering High-Risk Guardrail & Ops approval",
    sender_name: "Dr. Arvind Swamy",
    sender: "arvind.swamy@example.com",
    subject: "Incorrect ISBN printed on the back cover barcode",
    body: "Hi Support Team,\n\nThe barcode printed on the physical paperback copies corresponds to an older ISBN registered under a different title. This is causing retail inventory scanning errors at bookstores. Please correct the print PDF and update the metadata on all distributor feeds.",
    targetExplanation: "Tests metadata modification ('isbn_metadata') classified as high-impact, requiring mandatory operator approval.",
  },
  {
    id: "triage-cover",
    label: "Cover Design Change",
    icon: "🎨",
    category: "triage",
    badge: "Design Team",
    badgeType: "triage",
    description: "Pre-press artwork swap routed directly to Cover Design team",
    sender_name: "Rhea Sen",
    sender: "rhea.sen@example.com",
    subject: "Request to update front cover with revised illustration",
    body: "Hi team,\n\nMy illustrator has updated the front cover typography and spine dimensions. Since my book status is currently in pre-production proofing, can we swap out the existing cover file with this revised high-resolution file before mass printing begins?",
    targetExplanation: "Tests artwork modification ('cover_design') routed to Cover Design studio.",
  },
  {
    id: "triage-spam",
    label: "Marketing Spam (Fast-Path)",
    icon: "🚫",
    category: "triage",
    badge: "Fast-Path Block",
    badgeType: "triage",
    description: "Regex / keyword filter intercepts spam instantly without LLM latency",
    sender_name: "Bestseller Growth Hacks",
    sender: "promo@global-rank-boost.net",
    subject: "Guaranteed #1 Amazon Bestseller ranking for only $49!!",
    body: "Dear Author,\n\nWant 10,000 verified 5-star reviews on Amazon within 48 hours? Our proprietary AI SEO and review boost engine guarantees top 10 rankings. Click here to claim your limited 50% discount coupon today!",
    targetExplanation: "Tests Intake Filter fast-path: catches spam patterns instantly ($0.00 LLM cost) and routes directly to archive.",
  },

  // ── Custom / Blank Form ───────────────────────────────────────────────────
  {
    id: "custom",
    label: "Blank Custom Form",
    icon: "✍️",
    category: "custom",
    badge: "Custom Input",
    badgeType: "custom",
    description: "Clear all fields to type your own author scenario from scratch",
    sender_name: "",
    sender: "",
    subject: "",
    body: "",
    targetExplanation: "Write any custom author email to test how the LangGraph pipeline reacts in real time.",
  },
];

const DEFAULT_FORM_VALUES: CreateEmailPayload = {
  sender_name: "Siddharth Roy",
  sender: "siddharth.roy@example.com",
  subject: "International distribution setup for Amazon US/UK and POD turnaround",
  body: "Hello Notion Press Team,\n\nMy paperback is already active in India, but I would like to confirm how international distribution works across 150+ countries through Amazon.com (US/UK) and IngramSpark. How does your Print-on-Demand (POD) model handle international orders, and what is the typical retailer search indexing lag?\n\nThanks,\nSiddharth",
};

export default function ComposeEmailModal({ isOpen, onClose, onEmailCreated, initialData }: Props) {
  const [senderName, setSenderName] = useState(initialData?.sender_name ?? DEFAULT_FORM_VALUES.sender_name);
  const [sender, setSender] = useState(initialData?.sender ?? DEFAULT_FORM_VALUES.sender);
  const [subject, setSubject] = useState(initialData?.subject ?? DEFAULT_FORM_VALUES.subject);
  const [body, setBody] = useState(initialData?.body ?? DEFAULT_FORM_VALUES.body);
  const [activeCategory, setActiveCategory] = useState<PresetCategory>("all");
  const [activePreset, setActivePreset] = useState<string | null>("rag-global-distribution");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmittingRef.current) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredPresets = useMemo(() => {
    if (activeCategory === "all") return PRESETS;
    return PRESETS.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  const selectedPresetObj = useMemo(() => {
    return PRESETS.find(p => p.id === activePreset);
  }, [activePreset]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: Preset) => {
    if (preset.id === "custom") {
      setActivePreset("custom");
      setSenderName("");
      setSender("");
      setSubject("");
      setBody("");
    } else {
      setActivePreset(preset.id);
      setSenderName(preset.sender_name);
      setSender(preset.sender);
      setSubject(preset.subject);
      setBody(preset.body);
    }
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName.trim()) {
      setError("Please enter the author's name.");
      return;
    }
    if (!sender.trim() || !sender.includes("@")) {
      setError("Please enter a valid author email address.");
      return;
    }
    if (!subject.trim()) {
      setError("Please enter an email subject line.");
      return;
    }
    if (!body.trim()) {
      setError("Please enter the email body message.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const created = await createEmail({
        sender_name: senderName.trim(),
        sender: sender.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      onEmailCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to dispatch email. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const ragCount = PRESETS.filter(p => p.category === "rag").length;
  const triageCount = PRESETS.filter(p => p.category === "triage").length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div 
        className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <div>
              <h2 id="compose-modal-title" className="text-sm sm:text-base font-bold text-foreground">
                Simulate Author Email
              </h2>
              <p className="text-xs text-muted-foreground">
                Test real-time AI triage flow (Intake Filter → LLM / RAG / Cache → Guardrails → Action)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <form id="compose-email-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center gap-2 text-xs">
              <span className="font-bold">⚠️ Error:</span>
              <span>{error}</span>
            </div>
          )}

          {/* Quick Preset Templates Section */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span> Quick Scenario Presets (1-Click Test)
              </label>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-lg border border-border shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    activeCategory === "all"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({PRESETS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("rag")}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    activeCategory === "rag"
                      ? "bg-primary/20 text-primary border border-primary/30 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>📚</span>
                  <span>RAG Knowledge Base ({ragCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("triage")}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    activeCategory === "triage"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>🛡️</span>
                  <span>Triage & Ops ({triageCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("custom")}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    activeCategory === "custom"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ✍️ Blank
                </button>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredPresets.map((preset) => {
                const isSelected = activePreset === preset.id;
                const isRag = preset.category === "rag";
                const isTriage = preset.category === "triage";

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-lg border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer text-xs relative ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                        : "border-border bg-secondary/30 hover:bg-secondary/70 text-foreground"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5 w-full">
                      <div className="flex items-center gap-1.5 min-w-0 font-semibold">
                        <span className="text-base shrink-0">{preset.icon}</span>
                        <span className={`truncate text-xs ${isSelected ? "text-primary font-bold" : "text-foreground"}`}>
                          {preset.label}
                        </span>
                      </div>
                      <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded shrink-0 border ${
                        isRag 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                          : isTriage 
                          ? "bg-sky-500/10 text-sky-500 border-sky-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}>
                        {preset.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Target Explanation Banner */}
            {selectedPresetObj && selectedPresetObj.targetExplanation && (
              <div className="rounded-lg bg-secondary/60 border border-border p-2.5 flex items-start gap-2 text-[11px] text-foreground/90 animate-in fade-in duration-150">
                <span className="text-xs shrink-0 mt-0.5">
                  {selectedPresetObj.category === "rag" ? "📚" : selectedPresetObj.category === "triage" ? "🛡️" : "🎯"}
                </span>
                <div className="leading-relaxed">
                  <span className="font-semibold text-foreground">Scenario Target: </span>
                  <span className="text-muted-foreground">{selectedPresetObj.targetExplanation}</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3.5 space-y-3">
            {/* Sender Name & Email Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Author Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => { setSenderName(e.target.value); setActivePreset(null); }}
                  placeholder="e.g. Rohinton Mistry"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-hidden focus:ring-1 focus:ring-primary transition-all"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Author Email Address <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={sender}
                  onChange={(e) => { setSender(e.target.value); setActivePreset(null); }}
                  placeholder="e.g. author@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-hidden focus:ring-1 focus:ring-primary transition-all"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Subject Line <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setActivePreset(null); }}
                placeholder="Brief summary of author's request or inquiry"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-hidden focus:ring-1 focus:ring-primary transition-all"
                disabled={isSubmitting}
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-foreground">
                  Email Message Body <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {body.length} characters
                </span>
              </div>
              <textarea
                required
                rows={5}
                value={body}
                onChange={(e) => { setBody(e.target.value); setActivePreset(null); }}
                placeholder="Write the full email body as sent by the author..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs sm:text-sm focus:outline-hidden focus:ring-1 focus:ring-primary transition-all resize-y font-sans leading-relaxed"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="rounded-lg bg-secondary/50 p-2.5 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
            <span>💡</span>
            <span>
              Once sent, this email immediately appears in your Inbox and triggers the LangGraph real-time SSE stream.
            </span>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="compose-email-form"
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>Ingesting to AI Pipeline...</span>
              </>
            ) : (
              <>
                <span>🚀 Send as Author & Run Pipeline</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

