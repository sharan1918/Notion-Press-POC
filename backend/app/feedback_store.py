import json
import os
import threading
from app.models import HumanCorrection

class FeedbackStore:
    def __init__(self, filepath="data/corrections.json"):
        self.filepath = filepath
        self.lock = threading.Lock()
        self._corrections: list[HumanCorrection] = []
        self._load()

    def _load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self._corrections = [HumanCorrection(**item) for item in data]
            except Exception as e:
                print(f"Error loading corrections: {e}")
                self._corrections = []
        else:
            self._corrections = []

    def save_correction(self, correction: HumanCorrection) -> None:
        """Append and persist to JSON file. Thread-safe."""
        with self.lock:
            self._corrections.append(correction)
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump([c.model_dump() for c in self._corrections], f, indent=2)

    def get_all_corrections(self) -> list[HumanCorrection]:
        return list(self._corrections)

    def get_relevant_corrections(
        self,
        predicted_intent: str | None = None,
        max_recent: int = 5,
        max_category: int = 3
    ) -> list[HumanCorrection]:
        """Smart retrieval: return recent corrections + corrections relevant to predicted category."""
        recent = self._corrections[-max_recent:]
        
        category_relevant = []
        if predicted_intent:
            category_relevant = [
                c for c in self._corrections
                if c.corrected_intent == predicted_intent or c.original_intent == predicted_intent
            ][:max_category]
        
        # Deduplicate
        seen_ids = set()
        result = []
        for c in recent + category_relevant:
            key = f"{c.email_subject}-{c.timestamp}" # simple unique key
            if key not in seen_ids:
                seen_ids.add(key)
                result.append(c)
        return result

    def format_for_prompt(self, corrections: list[HumanCorrection]) -> str:
        """Format corrections as few-shot text for prompt injection."""
        if not corrections:
            return ""
        
        text = ""
        for c in corrections:
            text += f'- An email about "{c.email_subject}" was initially classified as "{c.original_intent}"\n'
            text += f'  but a human corrected it to "{c.corrected_intent}".\n'
            text += f'  Reason: "{c.notes}"\n\n'
        return text

# Global instance
feedback_store = FeedbackStore("data/corrections.json")
