import { useState, useEffect, useRef } from "react";
import type { Email, CreateEmailPayload } from "../types";
import { createEmail } from "../api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEmailCreated: (email: Email) => void;
  initialData?: Partial<CreateEmailPayload>;
}

interface Preset {
  id: string;
  label: string;
  icon: string;
  sender_name: string;
  sender: string;
  subject: string;
  body: string;
}

const PRESETS: Preset[] = [
  {
    id: "royalties",
    label: "Royalty Payout Delay",
    icon: "💰",
    sender_name: "Amitav Ghosh",
    sender: "amitav.ghosh@example.com",
    subject: "Royalty report mismatch and delayed payout for Q2",
    body: "Dear Notion Press Support,\n\nI reviewed my royalty dashboard for the second quarter and noticed that sales from Flipkart have not been reconciled. Furthermore, my payout was scheduled for the 10th but has not arrived in my registered bank account. Could you please investigate and share the breakdown?",
  },
  {
    id: "printing",
    label: "Print Quality Issue",
    icon: "📦",
    sender_name: "Kavita Rao",
    sender: "kavita.rao@example.com",
    subject: "URGENT: Defective print copies - Binding is peeling off",
    body: "Hello,\n\nI just received the consignment of 50 author copies of 'Shadows of Dusk'. Unfortunately, more than 15 copies have peeling spine binding and several pages have ink smudges on chapters 3 and 4. Please arrange a replacement batch immediately as my book launch is next week.",
  },
  {
    id: "isbn",
    label: "ISBN / Metadata",
    icon: "🏷️",
    sender_name: "Dr. Arvind Swamy",
    sender: "arvind.swamy@example.com",
    subject: "Incorrect ISBN printed on the back cover barcode",
    body: "Hi Support Team,\n\nThe barcode printed on the physical paperback copies corresponds to an older ISBN registered under a different title. This is causing retail inventory scanning errors at bookstores. Please correct the print PDF and update the metadata on all distributor feeds.",
  },
  {
    id: "cover",
    label: "Cover Design Change",
    icon: "🎨",
    sender_name: "Rhea Sen",
    sender: "rhea.sen@example.com",
    subject: "Request to update front cover with revised illustration",
    body: "Hi team,\n\nMy illustrator has updated the front cover typography and spine dimensions. Since my book status is currently in pre-production proofing, can we swap out the existing cover file with this revised high-resolution file before mass printing begins?",
  },
  {
    id: "spam",
    label: "Marketing Spam (Fast-Path)",
    icon: "🚫",
    sender_name: "Bestseller Growth Hacks",
    sender: "promo@global-rank-boost.net",
    subject: "Guaranteed #1 Amazon Bestseller ranking for only $49!!",
    body: "Dear Author,\n\nWant 10,000 verified 5-star reviews on Amazon within 48 hours? Our proprietary AI SEO and review boost engine guarantees top 10 rankings. Click here to claim your limited 50% discount coupon today!",
  },
  {
    id: "custom",
    label: "Blank Form",
    icon: "✍️",
    sender_name: "",
    sender: "",
    subject: "",
    body: "",
  },
];

const DEFAULT_FORM_VALUES: CreateEmailPayload = {
  sender_name: "Siddharth Roy",
  sender: "siddharth.roy@example.com",
  subject: "Query regarding distribution on Amazon Kindle international",
  body: "Hello Notion Press Team,\n\nMy paperback is already active in India, but I would like to confirm when the eBook version will be accessible to readers in the US and UK on Kindle Unlimited. Is there any additional tax form or royalty configuration I need to complete?\n\nThanks,\nSiddharth",
};

export default function ComposeEmailModal({ isOpen, onClose, onEmailCreated, initialData }: Props) {
  const [senderName, setSenderName] = useState(initialData?.sender_name ?? DEFAULT_FORM_VALUES.sender_name);
  const [sender, setSender] = useState(initialData?.sender ?? DEFAULT_FORM_VALUES.sender);
  const [subject, setSubject] = useState(initialData?.subject ?? DEFAULT_FORM_VALUES.subject);
  const [body, setBody] = useState(initialData?.body ?? DEFAULT_FORM_VALUES.body);
  const [activePreset, setActivePreset] = useState<string | null>(null);
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

  if (!isOpen) return null;

  const handleSelectPreset = (preset: Preset) => {
    if (preset.id === "custom") {
      setActivePreset(null);
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div 
        className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/40 shrink-0">
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
                Test real-time AI triage flow (Intake Filter → LLM / Cache → Guardrails → Action)
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

          {/* Quick Preset Templates */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              ⚡ Quick Scenario Presets (1-Click Test)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((preset) => {
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer text-xs ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border bg-secondary/40 hover:bg-secondary/80 text-foreground"
                    }`}
                  >
                    <span className="text-base shrink-0">{preset.icon}</span>
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
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
