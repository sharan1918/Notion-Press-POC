import re
import io
import logging
from typing import Optional
from pypdf import PdfReader

logger = logging.getLogger(__name__)

INTENT_KEYWORDS = {
    "publishing_status": ["timeline", "sla", "turnaround", "go-live", "proof", "spooling", "hardcover", "ebooks", "status", "days"],
    "distribution": ["distribution", "distributor", "amazon", "flipkart", "indexing", "marketplace", "edi", "pod", "print-on-demand", "ingramspark"],
    "general_inquiry": ["royalty", "royalties", "payout", "profit", "isbn", "barcode", "copyright", "manuscript", "submission", "publishing", "trim size", "author copy", "bulk", "unpublish", "cancel"],
}

def infer_intent(text: str, title: str = "") -> str:
    combined = f"{title.lower()} {text.lower()}"
    scores = {"general_inquiry": 0, "publishing_status": 0, "distribution": 0}
    
    for intent, kws in INTENT_KEYWORDS.items():
        for kw in kws:
            if kw in combined:
                scores[intent] += 1
                
    best_intent = max(scores, key=scores.get)
    if scores[best_intent] > 0:
        return best_intent
    return "general_inquiry"

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract full plain text from PDF bytes using pypdf."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages_text = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages_text.append(text.strip())
    return "\n\n".join(pages_text)

def chunk_document_text(text: str, filename: str) -> list[dict]:
    """
    Split extracted document text into logical semantic chunks.
    Detects section headers (e.g., '1. Title', 'Section 1:', '### Header') or falls back to paragraph chunking.
    """
    cleaned_text = re.sub(r'\r\n', '\n', text)
    cleaned_text = re.sub(r'[ \t]+', ' ', cleaned_text)
    
    # Try splitting on numbered sections: e.g. "1. Section Name", "Section 1: ...", "### Heading"
    # Matches patterns like "\n1. ", "\n2. ", "\n### ", "\nSection 1:"
    section_pattern = r'(?=(?:^|\n)(?:\d+\.\s+|Section\s+\d+[:\.]|###\s+|[A-Z0-9\s]{4,30}\n={3,}))'
    raw_sections = [s.strip() for s in re.split(section_pattern, cleaned_text, flags=re.MULTILINE) if s.strip()]
    
    # If regex didn't split well (fewer than 2 sections or huge blobs), split by double newline paragraphs
    if len(raw_sections) <= 1:
        paragraphs = [p.strip() for p in cleaned_text.split("\n\n") if len(p.strip()) > 30]
        # Group small paragraphs into ~300-500 character chunks
        raw_sections = []
        current_chunk = []
        current_len = 0
        for p in paragraphs:
            current_chunk.append(p)
            current_len += len(p)
            if current_len >= 400:
                raw_sections.append("\n\n".join(current_chunk))
                current_chunk = []
                current_len = 0
        if current_chunk:
            raw_sections.append("\n\n".join(current_chunk))

    # Clean filename for IDs
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', filename)
    
    chunks = []
    for idx, section in enumerate(raw_sections):
        # Extract title from the first line
        lines = [line.strip() for line in section.split("\n") if line.strip()]
        if not lines:
            continue
            
        first_line = lines[0]
        # Clean title: strip leading numbers or markdown marks
        title = re.sub(r'^(?:\d+[\.\)]\s*|Section\s+\d+[:\.]\s*|###\s*)', '', first_line).strip()
        if len(title) > 80:
            title = title[:77] + "..."
        if not title:
            title = f"{filename} (Section {idx + 1})"

        # Body is remainder of section or whole section
        content = section
        intent = infer_intent(content, title)
        
        chunks.append({
            "id": f"{safe_name}_chunk_{idx + 1}",
            "filename": filename,
            "title": title,
            "intent": intent,
            "content": content,
            "chunk_index": idx + 1,
        })

    return chunks
