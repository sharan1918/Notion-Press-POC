import { useState, type ChangeEvent } from "react";

interface Props {
  missingInfo: string[];
  onSubmit: (info: string, attachments: string[]) => void;
}

export default function MissingInfoForm({ missingInfo, onSubmit }: Props) {
  const [info, setInfo] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(f => f.name);
      setAttachments(prev => Array.from(new Set([...prev, ...newFiles])));
    }
  };

  const addQuickAttachment = (fileName: string) => {
    if (!attachments.includes(fileName)) {
      setAttachments(prev => [...prev, fileName]);
    }
  };

  const removeAttachment = (fileName: string) => {
    setAttachments(prev => prev.filter(f => f !== fileName));
  };

  return (
    <div className="mt-6 p-5 sm:p-6 bg-card border border-sky-300/70 dark:border-sky-500/30 rounded-xl shadow-xs animate-fadeIn">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-7 h-7 rounded-lg bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/25 dark:border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-sky-700 dark:text-sky-400">Additional Information Needed</h3>
      </div>
      
      <p className="text-xs sm:text-sm mb-3 text-muted-foreground leading-relaxed">
        The AI identified missing information required to process this request:
      </p>
      
      <ul className="text-xs sm:text-sm space-y-1.5 mb-5">
        {missingInfo.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sky-800 dark:text-sky-300">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
            <span className="flex-1 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
      
      <div className="mb-4">
        <label className="block text-xs text-muted-foreground mb-1">Provide missing details (simulating author reply):</label>
        <textarea 
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          className="w-full bg-background border border-border rounded-lg p-3 text-xs sm:text-sm text-foreground focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 outline-none h-24 resize-none mb-3"
          placeholder="e.g. My order number is #12345, title is 'My Great Book', and I have attached photos."
        />
      </div>

      {/* File & Photo / Video Upload Section */}
      <div className="mb-5 bg-background/50 border border-border rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach Photos / Video Proof
          </label>
          <span className="text-[10px] text-muted-foreground">Supported: .jpg, .png, .mp4, .pdf</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <label className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 border border-border shrink-0 shadow-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
              <path d="M12 12v9"/>
              <path d="m16 16-4-4-4 4"/>
            </svg>
            Choose File
            <input 
              type="file" 
              multiple 
              accept="image/*,video/*,.pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>
          
          <span className="text-[11px] text-muted-foreground hidden sm:inline">or quick-add sample proof:</span>
          
          <button 
            type="button" 
            onClick={() => addQuickAttachment("smudged_pages_45_50.jpg")}
            className="text-[11px] bg-secondary hover:bg-muted text-foreground/80 border border-border px-2 py-1 rounded-md transition-colors cursor-pointer"
          >
            📷 smudged_pages.jpg
          </button>
          <button 
            type="button" 
            onClick={() => addQuickAttachment("print_defect_proof.mp4")}
            className="text-[11px] bg-secondary hover:bg-muted text-foreground/80 border border-border px-2 py-1 rounded-md transition-colors cursor-pointer"
          >
            🎥 defect_proof.mp4
          </button>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 mt-2">
            {attachments.map((fileName, idx) => (
              <span key={idx} className="text-xs bg-secondary border border-border rounded-md px-2 py-1 flex items-center gap-1.5 font-mono text-foreground/90">
                <span>{fileName.endsWith('.mp4') ? '🎥' : '📷'}</span>
                {fileName}
                <button 
                  type="button" 
                  onClick={() => removeAttachment(fileName)} 
                  className="text-muted-foreground hover:text-destructive text-xs font-bold ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      
      <button 
        onClick={() => onSubmit(info, attachments)}
        disabled={!info.trim() && attachments.length === 0}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer shadow-xs"
      >
        <span>Submit &amp; Re-evaluate</span>
      </button>
    </div>
  );
}
