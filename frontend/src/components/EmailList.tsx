import type { Email, ProcessingResponse } from "../types";

interface Props {
  emails: Email[];
  selectedEmailId: string | null;
  onSelect: (id: string) => void;
  processingState: Record<string, ProcessingResponse>;
}

const intentColors: Record<string, string> = {
  royalty_payment: "bg-blue-500",
  publishing_status: "bg-teal-500",
  printing_issue: "bg-red-500",
  cover_design: "bg-purple-500",
  distribution: "bg-indigo-500",
  isbn_metadata: "bg-orange-500",
  general_inquiry: "bg-gray-500",
  complaint: "bg-rose-600",
  spam: "bg-stone-600"
};

export default function EmailList({ emails, selectedEmailId, onSelect, processingState }: Props) {
  return (
    <div className="w-80 border-r border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0">
        <h2 className="font-semibold text-lg">Author Inbox</h2>
        <p className="text-xs text-muted-foreground">{emails.length} messages</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {emails.map((email) => {
          const state = processingState[email.id]?.state;
          const isSelected = email.id === selectedEmailId;
          const intent = state?.classification?.intent;
          
          return (
            <div
              key={email.id}
              onClick={() => onSelect(email.id)}
              className={`p-4 border-b border-border cursor-pointer transition-colors hover:bg-accent/50 ${
                isSelected ? "bg-accent/80 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium shrink-0">
                  {email.sender_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{email.sender_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{new Date(email.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
              <h3 className="text-sm font-semibold truncate mb-1">{email.subject}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{email.body}</p>
              
              {intent && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${intentColors[intent] || "bg-gray-500"}`}></span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{intent.replace('_', ' ')}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
