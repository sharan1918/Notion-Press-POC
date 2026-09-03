import { useState } from "react";
import type { Email, ProcessingResponse } from "../types";

interface Props {
  emails: Email[];
  selectedEmailId: string | null;
  onSelect: (id: string) => void;
  processingState: Record<string, ProcessingResponse>;
  streamingIds?: Set<string>;
}

// Outlook-style avatar colors based on initial
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

export default function EmailList({ emails, selectedEmailId, onSelect, processingState, streamingIds }: Props) {
  const [tab, setTab] = useState<"focused" | "archive">("focused");
  const [search, setSearch] = useState("");

  const isArchived = (email: Email) => {
    const state = processingState[email.id]?.state;
    return state?.recommended_action?.action_type === "archive" || 
           state?.classification?.intent === "spam";
  };

  const archivedCount = emails.filter(isArchived).length;
  const focusedCount = emails.length - archivedCount;

  const filteredEmails = emails.filter(email => {
    const matchesSearch = email.sender_name.toLowerCase().includes(search.toLowerCase()) || 
                          email.subject.toLowerCase().includes(search.toLowerCase()) ||
                          email.body.toLowerCase().includes(search.toLowerCase());
    
    const archived = isArchived(email);

    if (tab === "archive") {
      return matchesSearch && archived;
    }
    return matchesSearch && !archived;
  });

  return (
    <div className="w-80 sm:w-88 border-r border-border bg-card flex flex-col h-full overflow-hidden shrink-0 select-none">
      {/* Outlook Tabs: Focused | Archive */}
      <div className="border-b border-border bg-card px-3 pt-2 pb-1.5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              onClick={() => setTab("focused")}
              className={`pb-1 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                tab === "focused" 
                  ? "border-primary text-foreground font-bold" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Focused</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground font-mono">
                {focusedCount}
              </span>
            </button>

            <button
              onClick={() => setTab("archive")}
              className={`pb-1 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                tab === "archive" 
                  ? "border-primary text-foreground font-bold" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>📦 Archive</span>
              {archivedCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-500 font-mono font-bold">
                  {archivedCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span title="Filter" className="hover:text-foreground cursor-pointer">≡</span>
            <span title="Sort" className="hover:text-foreground cursor-pointer">⇅</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full bg-background border border-border rounded px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* Date Header */}
      <div className="px-3 py-1.5 bg-background/50 border-b border-border/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span>▾</span>
          <span>{tab === "archive" ? "Archived / Spam" : "Active Inbox"} ({filteredEmails.length})</span>
        </div>
        {tab === "archive" && (
          <span className="text-[10px] font-mono text-emerald-500">Auto-Filtered by AI</span>
        )}
      </div>

      {/* Email Rows (Outlook Style) */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {filteredEmails.map((email) => {
          const state = processingState[email.id]?.state;
          const isSelected = email.id === selectedEmailId;
          const status = state?.final_status;
          const isSpam = isArchived(email);
          const avatarColor = getAvatarColor(email.sender_name);

          // Get initials
          const parts = email.sender_name.trim().split(" ");
          const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2);

          const isItemStreaming = streamingIds?.has(email.id) || status === "processing";

          return (
            <div
              key={email.id}
              onClick={() => onSelect(email.id)}
              className={`px-3 py-2.5 cursor-pointer transition-colors relative flex gap-2.5 ${
                isSelected 
                  ? "bg-secondary/90 border-l-[3px] border-l-primary" 
                  : "hover:bg-secondary/40 border-l-[3px] border-l-transparent"
              }`}
            >
              {/* Avatar Circle */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${avatarColor}`}>
                {initials.toUpperCase()}
              </div>

              {/* Email Content Snippet */}
              <div className="flex-1 min-w-0">
                {/* Row 1: Sender & Date */}
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={`text-xs truncate ${isSelected ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'}`}>
                    {email.sender_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {new Date(email.timestamp).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>

                {/* Row 2: Subject */}
                <div className="text-xs truncate text-foreground mb-0.5 font-medium leading-snug flex items-center gap-1.5">
                  <span className="truncate">{email.subject}</span>
                  {isSpam && (
                    <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
                      Archived
                    </span>
                  )}
                </div>

                {/* Row 3: Body snippet */}
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {email.body}
                </p>

                {/* Status indicator pill if streaming or processed */}
                {isItemStreaming ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                    <span className="text-[10px] font-mono font-medium text-primary">
                      AI Triaging...
                    </span>
                  </div>
                ) : status ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === 'executed' ? 'bg-emerald-500' :
                      status === 'pending_approval' ? 'bg-amber-500 animate-ping' :
                      status === 'pending_info' ? 'bg-blue-500' :
                      status === 'rejected' ? 'bg-rose-500' : 'bg-muted-foreground'
                    }`}></span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">
                      {status.replace('_', ' ')}
                    </span>
                    {/* Intake optimization badge */}
                    {state?.intake_result === "spam_filtered" && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">
                        ⚡ Fast-Path
                      </span>
                    )}
                    {state?.intake_result === "cache_hit" && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                        💾 Cached
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {filteredEmails.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-xs font-mono space-y-1">
            <p>No emails in {tab === "archive" ? "Archive" : "Focused Inbox"}.</p>
            {tab === "archive" && (
              <p className="text-[11px] text-muted-foreground/70">Processed spam and archived emails will appear here.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
