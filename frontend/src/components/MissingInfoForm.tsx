import { useState } from "react";

interface Props {
  missingInfo: string[];
  onSubmit: (info: string) => void;
}

export default function MissingInfoForm({ missingInfo, onSubmit }: Props) {
  const [info, setInfo] = useState("");

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
      
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Provide the missing details (simulating user reply):</label>
        <textarea 
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          className="w-full bg-background border border-border rounded p-3 text-sm focus:border-blue-500 outline-none h-24 resize-none mb-4"
          placeholder="e.g. My order number is #12345 and the title is 'My Great Book'"
        />
      </div>
      
      <button 
        onClick={() => onSubmit(info)}
        disabled={!info.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <span>📤</span> Submit & Re-evaluate
      </button>
    </div>
  );
}
