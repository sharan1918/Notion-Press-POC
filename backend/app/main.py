import os
import json
import uuid
import asyncio
import re
import time
import threading
from collections import defaultdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Header, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import sys
import logging
from typing import Optional
from pydantic import BaseModel
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from dotenv import load_dotenv

load_dotenv(override=True)

from app.sample_emails import SAMPLE_EMAILS, get_sample_email, get_all_emails, add_custom_email
from app.graph import create_graph
from app.feedback_store import feedback_store
from app.knowledge_base import author_knowledge_base
from app.pdf_parser import extract_text_from_pdf_bytes, chunk_document_text
from app.config import API_AUTH_KEY, RATE_LIMIT_EMAILS_PER_MINUTE


# Ensure data directory exists
os.makedirs("data", exist_ok=True)

checkpointer = None
graph = None

def serialize_state(state: dict) -> dict:
    res = {}
    for k, v in state.items():
        if k.startswith("__"):
            continue
        if hasattr(v, "model_dump"):
            res[k] = v.model_dump()
        elif isinstance(v, set):
            res[k] = list(v)
        elif isinstance(v, (list, tuple)):
            res[k] = [
                item.model_dump() if hasattr(item, "model_dump")
                else serialize_state(item) if isinstance(item, dict)
                else list(item) if isinstance(item, set)
                else item
                for item in v
                if not hasattr(item, "value") and "Interrupt" not in str(type(item))
                and isinstance(item, (str, int, float, bool, type(None), dict, list, set, tuple)) or hasattr(item, "model_dump")
            ]
        elif isinstance(v, dict):
            res[k] = serialize_state(v)
        elif isinstance(v, (str, int, float, bool, type(None))):
            res[k] = v
        else:
            # Safely skip non-serializable objects to prevent leaking internal memory addresses
            continue
    return res

@asynccontextmanager
async def lifespan(app: FastAPI):
    global checkpointer, graph
    with SqliteSaver.from_conn_string("data/checkpoints.sqlite") as saver:
        checkpointer = saver
        builder = create_graph()
        graph = builder.compile(checkpointer=checkpointer)
        yield

app = FastAPI(lifespan=lifespan)

cors_origins_env = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if "*" not in origins else ["*"],
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"--> [{request.method}] {request.url.path}", flush=True)
    response = await call_next(request)
    print(f"<-- [{request.method}] {request.url.path} => {response.status_code}", flush=True)
    return response


class CorrectionRequest(BaseModel):
    corrected_intent: str
    notes: str

class InfoRequest(BaseModel):
    additional_info: str
    attachments: list[str] = []

class CreateEmailRequest(BaseModel):
    sender_name: str
    sender: str
    subject: str
    body: str

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class InMemoryRateLimiter:
    def __init__(self, max_requests: int = 15, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = threading.Lock()

    def check(self, key: str) -> bool:
        now = time.time()
        with self.lock:
            cutoff = now - self.window_seconds
            valid_timestamps = [t for t in self.requests[key] if t > cutoff]
            if len(valid_timestamps) >= self.max_requests:
                self.requests[key] = valid_timestamps
                return False
            valid_timestamps.append(now)
            self.requests[key] = valid_timestamps
            return True

email_rate_limiter = InMemoryRateLimiter(max_requests=RATE_LIMIT_EMAILS_PER_MINUTE, window_seconds=60)

@app.get("/api/emails")
def get_emails():
    return get_all_emails()

@app.post("/api/emails", status_code=201)
def create_email(
    req: CreateEmailRequest,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    if not x_api_key or x_api_key != API_AUTH_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    client_ip = request.client.host if request.client else "unknown"
    if not email_rate_limiter.check(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded for author email simulation. Maximum 15 emails per minute."
        )

    if not req.sender_name.strip():
        raise HTTPException(status_code=400, detail="Sender name is required")
    if not req.sender.strip():
        raise HTTPException(status_code=400, detail="Sender email is required")
    if not EMAIL_REGEX.match(req.sender.strip()):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if not req.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")
    if not req.body.strip():
        raise HTTPException(status_code=400, detail="Email body is required")
        
    created = add_custom_email(
        sender_name=req.sender_name,
        sender=req.sender,
        subject=req.subject,
        body=req.body
    )
    return created.model_dump()


@app.get("/api/process-stream/{email_id}")
async def process_email_stream(email_id: str):
    try:
        email = get_sample_email(email_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Email not found")

    thread_id = f"thread_{email_id}_{uuid.uuid4().hex[:12]}"
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {"email": email}

    async def event_generator():
        queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def stream_worker():
            try:
                for val in graph.stream(initial_state, config, stream_mode="values"):
                    serialized = serialize_state(val)
                    asyncio.run_coroutine_threadsafe(queue.put(("data", serialized)), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(("done", None)), loop).result()
            except Exception as e:
                asyncio.run_coroutine_threadsafe(queue.put(("error", str(e))), loop).result()

        worker_thread = threading.Thread(target=stream_worker, daemon=True)
        worker_thread.start()

        print(f"--> [STREAM START] {email.sender}: {email.subject} ({thread_id})", flush=True)

        while True:
            msg_type, payload = await queue.get()
            if msg_type == "data":
                print(f"[STREAM NODE] status: {payload.get('final_status')}", flush=True)
                yield f"data: {json.dumps({'thread_id': thread_id, 'state': payload})}\n\n"
            elif msg_type == "done":
                yield "data: [DONE]\n\n"
                print(f"<-- [STREAM COMPLETE] {thread_id}", flush=True)
                break
            elif msg_type == "error":
                print(f"[STREAM ERROR] {payload}", flush=True)
                err_payload = json.dumps({
                    "thread_id": thread_id,
                    "state": {
                        "email": email.model_dump(),
                        "final_status": "error",
                        "processing_log": [f"Pipeline error: {payload}"]
                    }
                })
                yield f"data: {err_payload}\n\n"
                yield "data: [DONE]\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/process/{email_id}")
def process_email(email_id: str):
    try:
        email = get_sample_email(email_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Email not found")
        
    thread_id = f"thread_{email_id}_{uuid.uuid4().hex[:12]}"
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_state = {"email": email}
    # Invoke the graph
    result = graph.invoke(initial_state, config)
    return {"thread_id": thread_id, "state": result}

@app.post("/api/approve/{thread_id}")
def approve_action(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    command = Command(resume={"decision": "approve"})
    try:
        result = graph.invoke(command, config)
        return {"thread_id": thread_id, "state": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/reject/{thread_id}")
def reject_action(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    command = Command(resume={"decision": "reject"})
    try:
        result = graph.invoke(command, config)
        return {"thread_id": thread_id, "state": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/correct/{thread_id}")
def correct_classification(thread_id: str, req: CorrectionRequest):
    config = {"configurable": {"thread_id": thread_id}}
    command = Command(resume={"decision": "correct", "corrected_intent": req.corrected_intent, "notes": req.notes})
    try:
        result = graph.invoke(command, config)
        return {"thread_id": thread_id, "state": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/provide-info/{thread_id}")
def provide_info(thread_id: str, req: InfoRequest):
    config = {"configurable": {"thread_id": thread_id}}
    command = Command(resume={"additional_info": req.additional_info, "attachments": req.attachments})
    try:
        result = graph.invoke(command, config)
        return {"thread_id": thread_id, "state": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/status/{thread_id}")
def get_status(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    state = graph.get_state(config)
    if not state.values:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread_id": thread_id, "state": state.values}

@app.get("/api/corrections")
def get_corrections():
    return [c.model_dump() for c in feedback_store.get_all_corrections()]

class TriageRequest(BaseModel):
    email_ids: list[str] = []  # Empty = triage all sample emails

# In-memory storage for batch triage jobs
triage_jobs: dict[str, dict] = {}

async def _process_triage_job(job_id: str, target_ids: list[str]):
    """Background task to process emails concurrently with real-time progressive result streaming."""
    from app.config import TRIAGE_CONCURRENCY, TRIAGE_DELAY_SECONDS
    from app.intake_filter import check_spam
    from app.graph import intent_cache
    
    if job_id not in triage_jobs:
        triage_jobs[job_id] = {"status": "processing", "total": len(target_ids), "results": {}}
    else:
        triage_jobs[job_id]["status"] = "processing"
        if "results" not in triage_jobs[job_id]:
            triage_jobs[job_id]["results"] = {}

    sem = asyncio.Semaphore(TRIAGE_CONCURRENCY)

    async def _triage_single(email_id: str):
        async with sem:
            try:
                email = get_sample_email(email_id)
            except ValueError:
                triage_jobs[job_id]["results"][email_id] = {"error": "unknown_email_id"}
                return

            thread_id = f"thread_{email_id}_{uuid.uuid4().hex[:12]}"
            config = {"configurable": {"thread_id": thread_id}}
            initial_state = {"email": email}

            # Predict if LLM will be used by checking fast-paths
            pre_spam_check = check_spam(email)
            is_deterministic_spam = pre_spam_check.outcome == "spam_filtered"
            
            is_cache_hit = False
            if not is_deterministic_spam:
                cache_result = intent_cache.get_cached_classification(email)
                if cache_result and cache_result.outcome == "cache_hit":
                    is_cache_hit = True

            uses_llm = not (is_deterministic_spam or is_cache_hit)

            if uses_llm and TRIAGE_DELAY_SECONDS > 0:
                await asyncio.sleep(TRIAGE_DELAY_SECONDS)

            loop = asyncio.get_running_loop()
            try:
                # Add timeout to prevent hanging threads (30s)
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: graph.invoke(initial_state, config)),
                    timeout=30.0
                )
                serialized = serialize_state(result)
                email_result = {"thread_id": thread_id, "state": serialized}
                # Immediately publish this result so polling frontend updates in real-time
                triage_jobs[job_id]["results"][email_id] = email_result

                intake = serialized.get("intake_result")
                logging.info(
                    f"[TRIAGE] {email.sender_name}: {email.subject} → "
                    f"{serialized.get('final_status', '?')} "
                    f"(intake={intake or 'full_pipeline'})"
                )

            except TimeoutError:
                logging.error(f"[TRIAGE ERROR] {email_id}: LangGraph invoke timed out after 30s")
                triage_jobs[job_id]["results"][email_id] = {
                    "thread_id": thread_id,
                    "error": "timeout",
                    "state": {
                        "email": email.model_dump(),
                        "final_status": "error",
                        "processing_log": ["Triage error: LangGraph execution timed out"],
                    },
                }
            except Exception as e:
                logging.error(f"[TRIAGE ERROR] {email_id}: {e}")
                triage_jobs[job_id]["results"][email_id] = {
                    "thread_id": thread_id,
                    "error": str(e),
                    "state": {
                        "email": email.model_dump(),
                        "final_status": "error",
                        "processing_log": [f"Triage error: {str(e)}"],
                    },
                }

    # Execute all email triage tasks concurrently with semaphore concurrency control
    await asyncio.gather(*(_triage_single(eid) for eid in target_ids))
    triage_jobs[job_id]["status"] = "completed"


@app.post("/api/triage-all", status_code=202)
async def triage_all_emails(background_tasks: BackgroundTasks, req: TriageRequest = TriageRequest()):
    """
    Batch auto-triage: process multiple emails through the LangGraph pipeline.
    Runs in the background and returns a job_id for polling.
    """
    from app.config import TRIAGE_DELAY_SECONDS
    from app.intake_filter import check_spam

    MAX_TRIAGE_EMAILS = 50
    if len(req.email_ids) > MAX_TRIAGE_EMAILS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many email IDs requested. Maximum allowed is {MAX_TRIAGE_EMAILS}."
        )

    target_ids = req.email_ids if req.email_ids else [e["id"] for e in get_all_emails()]
    
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    triage_jobs[job_id] = {
        "status": "pending",
        "total": len(target_ids),
        "results": {}
    }
    
    background_tasks.add_task(_process_triage_job, job_id, target_ids)
    
    return {"job_id": job_id, "status": "accepted"}

@app.get("/api/triage-status/{job_id}")
def get_triage_status(job_id: str):
    job = triage_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── Knowledge Base (RAG) Endpoints ──────────────────────────────────────────

class TestQueryRequest(BaseModel):
    query: str
    top_k: int = 2

@app.get("/api/knowledge/status")
def get_knowledge_status():
    """Get high-level status of the ChromaDB knowledge base."""
    return author_knowledge_base.get_status()

@app.get("/api/knowledge/documents")
def list_knowledge_documents():
    """List all indexed documents and chunk counts."""
    return author_knowledge_base.list_documents()

@app.get("/api/knowledge/chunks")
def list_knowledge_chunks(filename: Optional[str] = None):
    """List all indexed chunks with optional filename filter."""
    return author_knowledge_base.get_all_chunks(filename)

@app.post("/api/knowledge/upload", status_code=201)
async def upload_knowledge_document(file: UploadFile = File(...)):
    """
    Upload a PDF, TXT, or MD document into the RAG knowledge base.
    Parses, chunks, and indexes it into ChromaDB.
    """
    allowed_extensions = {".pdf", ".txt", ".md"}
    filename = file.filename or "uploaded_document.pdf"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Only .pdf, .txt, and .md files are supported."
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        if ext == ".pdf":
            text = extract_text_from_pdf_bytes(content)
        else:
            text = content.decode("utf-8", errors="ignore")

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract readable text from the uploaded file. Please ensure the PDF is not a scanned image."
            )

        chunks = chunk_document_text(text, filename)
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not create semantic chunks from the document.")

        indexed_count = author_knowledge_base.add_document_chunks(filename, chunks)
        
        return {
            "success": True,
            "filename": filename,
            "chunks_indexed": indexed_count,
            "total_documents": len(author_knowledge_base.list_documents()),
            "chunks": [
                {
                    "title": c["title"],
                    "intent": c["intent"],
                    "preview": c["content"][:150] + "..." if len(c["content"]) > 150 else c["content"]
                }
                for c in chunks
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[KB UPLOAD ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@app.delete("/api/knowledge/documents/{filename}")
def delete_knowledge_document(filename: str):
    """Delete all chunks for a specific document."""
    deleted_count = author_knowledge_base.delete_document(filename)
    return {
        "success": True,
        "filename": filename,
        "deleted_chunks": deleted_count,
        "status": author_knowledge_base.get_status()
    }

@app.delete("/api/knowledge/clear")
def clear_knowledge_base():
    """Clear all documents from the knowledge base."""
    cleared_count = author_knowledge_base.clear_all()
    return {
        "success": True,
        "cleared_chunks": cleared_count,
        "status": author_knowledge_base.get_status()
    }

@app.get("/api/knowledge/sample-pdf")
def download_sample_pdf():
    """Download the official Notion Press Author Publishing Policy Handbook PDF."""
    pdf_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "sample_docs", "Notion_Press_Author_Publishing_Policy_Handbook.pdf")
    )
    if not os.path.exists(pdf_path):
        from scripts.generate_sample_pdf import generate_handbook
        generate_handbook(pdf_path)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename="Notion_Press_Author_Publishing_Policy_Handbook.pdf"
    )

@app.post("/api/knowledge/quick-seed-sample")
def quick_seed_sample_pdf():
    """One-click server ingestion of the Notion Press Author Publishing Policy Handbook PDF."""
    pdf_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "sample_docs", "Notion_Press_Author_Publishing_Policy_Handbook.pdf")
    )
    if not os.path.exists(pdf_path):
        from scripts.generate_sample_pdf import generate_handbook
        generate_handbook(pdf_path)

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text = extract_text_from_pdf_bytes(pdf_bytes)
    chunks = chunk_document_text(text, "Notion_Press_Author_Publishing_Policy_Handbook.pdf")
    indexed_count = author_knowledge_base.add_document_chunks("Notion_Press_Author_Publishing_Policy_Handbook.pdf", chunks)

    return {
        "success": True,
        "filename": "Notion_Press_Author_Publishing_Policy_Handbook.pdf",
        "chunks_indexed": indexed_count,
        "status": author_knowledge_base.get_status()
    }

@app.post("/api/knowledge/test-query")
def test_knowledge_query(req: TestQueryRequest):
    """Test RAG retrieval matching for a query text."""
    results = author_knowledge_base.query_knowledge(query_text=req.query, top_k=req.top_k)
    return {
        "query": req.query,
        "results_count": len(results),
        "results": results
    }

