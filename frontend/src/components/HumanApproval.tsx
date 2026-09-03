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
    <div className="mt-6 p-6 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-fadeIn">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">⚠️</span>
        <h3 className="text-lg font-semibold text-amber-500">Pending Human Approval</h3>
      </div>
      
      <p className="text-sm mb-6 text-muted-foreground">
        The AI recommended an action that requires human review before execution.
      </p>

      {!showCorrection ? (
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4">
          <button 
            onClick={onApprove}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-xs sm:text-sm font-medium transition-colors cursor-pointer"
          >
            ✅ Approve & Execute
          </button>
          <button 
            onClick={onReject}
            className="flex-1 bg-destructive hover:bg-destructive/80 text-white py-2 px-3 rounded text-xs sm:text-sm font-medium transition-colors cursor-pointer"
          >
            ❌ Reject (End)
          </button>
          <button 
            onClick={() => setShowCorrection(true)}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 rounded text-xs sm:text-sm font-medium transition-colors cursor-pointer"
          >
            ✏️ Correct AI
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-4 border-t border-amber-500/20">
          <h4 className="font-medium text-amber-500">Correct the Classification</h4>
          
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Correct Intent</label>
            <select 
              value={selectedIntent}
              onChange={(e) => setSelectedIntent(e.target.value)}
              className="w-full bg-background border border-border rounded p-2 text-sm focus:border-amber-500 outline-none"
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
              className="w-full bg-background border border-border rounded p-2 text-sm focus:border-amber-500 outline-none h-20 resize-none"
              placeholder="e.g. The email mentioned an ISBN, so it's a metadata issue, not a general inquiry."
            />
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => onCorrect(selectedIntent, notes)}
              disabled={!notes.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              Submit & Re-evaluate
            </button>
            <button 
              onClick={() => setShowCorrection(false)}
              className="bg-secondary hover:bg-secondary/80 px-4 py-2 rounded text-sm font-medium transition-colors"
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
