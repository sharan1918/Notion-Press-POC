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
    <div className="mt-6 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg animate-fadeIn">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">ℹ️</span>
        <h3 className="text-lg font-semibold text-blue-500">Additional Information Needed</h3>
      </div>
      
      <p className="text-sm mb-4 text-muted-foreground">
        The AI identified missing information required to process this request:
      </p>
      
      <ul className="list-disc list-inside text-sm space-y-1 mb-6 text-blue-400">
        {missingInfo.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      
      <div className="mb-4">
        <label className="block text-xs text-muted-foreground mb-1">Provide missing details (simulating author reply):</label>
        <textarea 
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          className="w-full bg-background border border-border rounded p-3 text-sm focus:border-blue-500 outline-none h-24 resize-none mb-3"
          placeholder="e.g. My order number is #12345, title is 'My Great Book', and I have attached photos."
        />
      </div>

      {/* File & Photo / Video Upload Section */}
      <div className="mb-6 bg-background/50 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-2">
            <span>📎</span> Attach Photos / Video Proof
          </label>
          <span className="text-[10px] text-muted-foreground">Supported: .jpg, .png, .mp4, .pdf</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
          <label className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium px-3 py-2 rounded cursor-pointer transition-colors flex items-center gap-2 border border-border shrink-0">
            <span>📁</span> Choose File
            <input 
              type="file" 
              multiple 
              accept="image/*,video/*,.pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>
          
          <span className="text-xs text-muted-foreground hidden sm:inline">or quick-add sample proof:</span>
          
          <button 
            type="button" 
            onClick={() => addQuickAttachment("smudged_pages_45_50.jpg")}
            className="text-[11px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded hover:bg-blue-500/30 transition-colors cursor-pointer"
          >
            📷 smudged_pages.jpg
          </button>
          <button 
            type="button" 
            onClick={() => addQuickAttachment("print_defect_proof.mp4")}
            className="text-[11px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors cursor-pointer"
          >
            🎥 defect_proof.mp4
          </button>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
            {attachments.map((fileName, idx) => (
              <span key={idx} className="text-xs bg-secondary border border-border rounded px-2.5 py-1 flex items-center gap-2 font-mono text-blue-400">
                <span>{fileName.endsWith('.mp4') ? '🎥' : '📷'}</span>
                {fileName}
                <button 
                  type="button" 
                  onClick={() => removeAttachment(fileName)} 
                  className="text-muted-foreground hover:text-destructive text-xs font-bold"
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
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <span>📤</span> Submit & Re-evaluate
      </button>
    </div>
  );
}
