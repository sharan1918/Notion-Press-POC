import { useState } from "react";
import type { ProcessingResponse } from "../types";

interface Props {
  state: ProcessingResponse["state"];
  onApprove: () => void;
  onReject: () => void;
  onCorrect: (intent: string, notes: string) => void;
}

const INTENTS = [
  "royalty_payment", "publishing_status", "printing_issue",
  "cover_design", "distribution", "isbn_metadata",
  "general_inquiry", "complaint", "spam"
];

export default function HumanApproval({ state, onApprove, onReject, onCorrect }: Props) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState(state.classification?.intent || "");
  const [notes, setNotes] = useState("");

  return (
    <div className="mt-6 p-5 sm:p-6 bg-card border border-amber-300/80 dark:border-amber-500/30 rounded-xl shadow-xs animate-fadeIn">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-800 dark:text-amber-400 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 className="text-sm sm:text-base font-bold text-amber-900 dark:text-amber-300">Pending Human Approval</h3>
      </div>
      
      <p className="text-xs sm:text-sm mb-5 text-muted-foreground leading-relaxed">
        The AI recommended an action that requires human review before execution.
      </p>

      {!showCorrection ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Approve Button - Deep Matte Emerald */}
          <button 
            onClick={onApprove}
            className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Approve &amp; Execute</span>
          </button>

          {/* Reject Button - Deep Matte Rose */}
          <button 
            onClick={onReject}
            className="w-full bg-rose-800 hover:bg-rose-900 active:bg-rose-950 text-white py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Reject (End)</span>
          </button>

          {/* Correct AI Button - Deep Matte Amber */}
          <button 
            onClick={() => setShowCorrection(true)}
            className="w-full bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            <span>Correct AI</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">Correct the Classification</h4>
          
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Correct Intent</label>
            <select 
              value={selectedIntent}
              onChange={(e) => setSelectedIntent(e.target.value)}
              className="w-full bg-background border border-border rounded-lg p-2 text-xs sm:text-sm text-foreground focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none"
            >
              {INTENTS.map(intent => (
                <option key={intent} value={intent}>{intent.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Why was the AI wrong? (Helps it learn)</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-background border border-border rounded-lg p-2.5 text-xs sm:text-sm text-foreground focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none h-20 resize-none"
              placeholder="e.g. The email mentioned an ISBN, so it's a metadata issue, not a general inquiry."
            />
          </div>
          
          <div className="flex gap-2.5">
            <button 
              onClick={() => onCorrect(selectedIntent, notes)}
              disabled={!notes.trim()}
              className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              Submit &amp; Re-evaluate
            </button>
            <button 
              onClick={() => setShowCorrection(false)}
              className="bg-secondary hover:bg-muted text-secondary-foreground border border-border px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
          
          <p className="text-[10px] text-muted-foreground mt-2">
            Correction {state.correction_count! + 1} of 3 before forced manual review.
          </p>
        </div>
      )}
    </div>
  );
}
