import os
import logging
import threading
from typing import Optional
import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

DEFAULT_PERSIST_DIR = "data/chromadb"
DEFAULT_COLLECTION_NAME = "author_knowledge_base"

# Curated knowledge documents for Notion Press Author Support
SEED_KNOWLEDGE_DOCUMENTS = [
    # ── General Inquiry: Publishing Steps ─────────────────────────────────────
    {
        "id": "kb_publishing_roadmap",
        "title": "Notion Press Self-Publishing Roadmap & Steps",
        "intent": "general_inquiry",
        "content": (
            "Notion Press 5-Step Self-Publishing Process:\n"
            "1. Project Creation: Sign up on notionpress.com and initiate a new book project.\n"
            "2. Manuscript Upload: Upload your manuscript in MS Word (.docx) or print-ready PDF format. "
            "Supported trim sizes include 5x8 inches, 6x9 inches, and standard A5.\n"
            "3. Cover Design: Design your cover using the online cover creator or upload your own 300 DPI CMYK cover file.\n"
            "4. Pricing & ISBN: Set your retail MRP using our royalty calculator. Notion Press provides free ISBN assignment for both paperback and eBook formats.\n"
            "5. Proof Approval & Launch: Review and approve your digital galley proof. Once approved, the book enters print production and syndication. "
            "The standard end-to-end timeline from manuscript upload to live publication is 7 to 14 business days."
        ),
    },
    # ── General Inquiry: Royalties & Rights ────────────────────────────────────
    {
        "id": "kb_royalty_policy",
        "title": "Author Royalty Calculation & Payout Schedule",
        "intent": "general_inquiry",
        "content": (
            "Pricing and Author Royalties Policy:\n"
            "- DIY self-publishing on Notion Press is 100% free with no mandatory paid packages.\n"
            "- Profit Formula: Authors earn 100% of the Net Author Profit on every copy sold. "
            "Net Profit = MRP - Production/Printing Cost - Distribution Margin.\n"
            "- Payout Schedule: Royalties are calculated on a calendar-month basis and disbursed directly to the author's registered bank account by the 10th of each following month for reconciled sales.\n"
            "- Minimum Threshold: The minimum payout threshold is ₹1,000. Balances below ₹1,000 roll over automatically to the subsequent month.\n"
            "- Copyright & Ownership: The author retains 100% intellectual property, adaptation, and copyright. Notion Press operates on a non-exclusive author agreement, allowing authors to unpublish or revise content at any time."
        ),
    },
    # ── General Inquiry: ISBN & Copyright ─────────────────────────────────────
    {
        "id": "kb_isbn_guidelines",
        "title": "ISBN Allocation & Barcode Guidelines",
        "intent": "general_inquiry",
        "content": (
            "ISBN Allocation and Barcodes:\n"
            "- Free 13-digit ISBNs are assigned by Notion Press for both paperback and eBook editions upon project setup.\n"
            "- Authors who already have their own ISBN registered through the Raja Rammohun Roy National Agency can register it at no charge.\n"
            "- EAN-13 barcodes are automatically generated and printed on the bottom-right corner of the back cover.\n"
            "- ISBN Immutability: International ISBN standards dictate that once an ISBN is assigned and registered, it cannot be modified or transferred to another book title. Substantial revisions (>20% text alteration or trim size change) require a new ISBN."
        ),
    },
    # ── Publishing Status: Production SLAs ────────────────────────────────────
    {
        "id": "kb_production_slas",
        "title": "Production Turnaround & Go-Live SLAs Post-Proof Approval",
        "intent": "publishing_status",
        "content": (
            "Go-Live Timelines After Final Proof Approval:\n"
            "- Proof Validation: Once the author approves the digital proof, pre-press validation and printer spooling take 48 to 72 hours.\n"
            "- Notion Press Online Store: The book goes live for purchase within 3 to 5 business days.\n"
            "- Amazon India & Flipkart Syndication: Distribution feeds push listings to Amazon and Flipkart within 7 to 14 business days post proof approval.\n"
            "- Retailer Sync Period: Initial listings on Amazon or Flipkart may display 'Temporarily Out of Stock' for the first 24 to 48 hours while the retailer's inventory ingestion engine caches the product details and barcode.\n"
            "- Hardcover Editions: Require 10 to 14 business days due to hardcase binding and dry-mounting.\n"
            "- eBooks (Kindle/Kobo): Go live within 3 to 5 business days."
        ),
    },
    # ── Distribution: Indexing & Marketplace Channels ────────────────────────
    {
        "id": "kb_distribution_indexing",
        "title": "Distribution Channels & Marketplace Catalog Indexing",
        "intent": "distribution",
        "content": (
            "Distribution Channels and Marketplace Synchronization:\n"
            "- Domestic Channels: Notion Press Store, Amazon.in, and Flipkart.\n"
            "- Catalog Indexing Lag: When a book is syndicated, metadata (title, author, ISBN, price, description) is transmitted via automated EDI feeds. Because Amazon and Flipkart refresh search indexes asynchronously, it typically takes 5 to 7 business days for the book to appear in customer search results.\n"
            "- Print-on-Demand (POD) Model: Notion Press books are manufactured upon customer order. Books do not sit in centralized warehouse inventory; orders are printed, bound, and dispatched within 48 hours of order placement.\n"
            "- International Distribution: Available across 150+ countries via Amazon.com (US, UK, Europe) and IngramSpark. Global POD distribution setup takes 2 to 3 weeks for international retailer activation."
        ),
    },
]


class AuthorKnowledgeBase:
    """
    Persistent ChromaDB vector store for Notion Press operational policies and author FAQs.
    Shares the existing ChromaDB instance and client configuration.
    """

    def __init__(
        self,
        persist_directory: str = DEFAULT_PERSIST_DIR,
        collection_name: str = DEFAULT_COLLECTION_NAME,
    ):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self.lock = threading.RLock()
        self.client = None
        self.collection = None
        self._in_memory_docs: list[dict] = list(SEED_KNOWLEDGE_DOCUMENTS)

        with self.lock:
            self._init_chroma_client()
            self._seed_default_knowledge()

    def _init_chroma_client(self):
        """Initialize ChromaDB client matching feedback_store / intent_cache configuration."""
        chroma_host = os.environ.get("CHROMA_HOST")
        chroma_port = int(os.environ.get("CHROMA_PORT", "8000"))
        chroma_ssl = os.environ.get("CHROMA_SSL", "false").lower() == "true"

        try:
            if chroma_host:
                logger.info(f"[KB] Connecting to remote ChromaDB at {chroma_host}:{chroma_port}")
                self.client = chromadb.HttpClient(
                    host=chroma_host,
                    port=chroma_port,
                    ssl=chroma_ssl,
                    settings=Settings(anonymized_telemetry=False),
                )
            else:
                os.makedirs(self.persist_directory, exist_ok=True)
                self.client = chromadb.PersistentClient(
                    path=self.persist_directory,
                    settings=Settings(anonymized_telemetry=False),
                )

            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
            logger.info(f"[KB] Initialized ChromaDB collection '{self.collection_name}' successfully")
        except Exception as e:
            logger.warning(f"[KB] ChromaDB initialization failed: {e}. Operating in in-memory fallback mode.")
            self.client = None
            self.collection = None

    def _seed_default_knowledge(self):
        """Seed default knowledge documents into ChromaDB if not already present."""
        if not self.collection:
            return

        try:
            count = self.collection.count()
            if count == 0:
                logger.info(f"[KB] Seeding {len(SEED_KNOWLEDGE_DOCUMENTS)} documents into ChromaDB...")
                ids = [doc["id"] for doc in SEED_KNOWLEDGE_DOCUMENTS]
                documents = [doc["content"] for doc in SEED_KNOWLEDGE_DOCUMENTS]
                metadatas = [
                    {"title": doc["title"], "intent": doc["intent"]}
                    for doc in SEED_KNOWLEDGE_DOCUMENTS
                ]
                self.collection.add(
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas,
                )
                logger.info("[KB] Default knowledge seeding complete.")
        except Exception as e:
            logger.warning(f"[KB] Failed to seed default knowledge: {e}")

    def query_knowledge(
        self,
        query_text: str,
        intent: Optional[str] = None,
        top_k: int = 2,
    ) -> list[dict]:
        """
        Query the knowledge base for relevant policy chunks.
        Optionally filters by intent (general_inquiry, publishing_status, distribution).
        Falls back to in-memory search if ChromaDB is unavailable.
        """
        with self.lock:
            # 1. Attempt ChromaDB Query
            if self.collection:
                try:
                    # Try intent-filtered query first if provided
                    query_kwargs = {
                        "query_texts": [query_text],
                        "n_results": top_k,
                    }
                    if intent:
                        query_kwargs["where"] = {"intent": intent}

                    results = self.collection.query(**query_kwargs)

                    documents = results.get("documents", [[]])[0]
                    metadatas = results.get("metadatas", [[]])[0]
                    distances = results.get("distances", [[]])[0]

                    # If filtered query yielded no results, retry without filter
                    if not documents and intent:
                        query_kwargs.pop("where", None)
                        results = self.collection.query(**query_kwargs)
                        documents = results.get("documents", [[]])[0]
                        metadatas = results.get("metadatas", [[]])[0]
                        distances = results.get("distances", [[]])[0]

                    if documents:
                        retrieved = []
                        for doc, meta, dist in zip(documents, metadatas, distances):
                            retrieved.append({
                                "title": meta.get("title", "Notion Press Guide"),
                                "intent": meta.get("intent", "general_inquiry"),
                                "content": doc,
                                "similarity_score": round(1.0 - dist, 3) if dist is not None else 1.0,
                            })
                        return retrieved
                except Exception as e:
                    logger.warning(f"[KB] ChromaDB query error: {e}. Falling back to in-memory search.")

            # 2. In-Memory Fallback
            return self._in_memory_search(query_text, intent, top_k)

    def _in_memory_search(
        self,
        query_text: str,
        intent: Optional[str] = None,
        top_k: int = 2,
    ) -> list[dict]:
        """Simple keyword matching fallback for offline/test resilience."""
        query_lower = query_text.lower()
        candidates = self._in_memory_docs

        if intent:
            filtered = [d for d in candidates if d["intent"] == intent]
            if filtered:
                candidates = filtered

        scored = []
        for doc in candidates:
            score = 0
            for word in query_lower.split():
                if len(word) <= 2:
                    continue
                if word in doc["title"].lower():
                    score += 3
                if word in doc["content"].lower():
                    score += 1
            scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_docs = [doc for _, doc in scored[:top_k]]

        return [
            {
                "title": d["title"],
                "intent": d["intent"],
                "content": d["content"],
                "similarity_score": 0.85,
            }
            for d in top_docs
        ]


# Singleton instance
author_knowledge_base = AuthorKnowledgeBase()
