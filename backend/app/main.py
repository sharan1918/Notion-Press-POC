import os
import json
import uuid
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import sys
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("uvicorn")
from pydantic import BaseModel
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from dotenv import load_dotenv

load_dotenv(override=True)

from app.sample_emails import SAMPLE_EMAILS, get_sample_email
from app.graph import create_graph
from app.feedback_store import feedback_store

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

@app.get("/api/emails")
def get_emails():
    return SAMPLE_EMAILS

import threading

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

@app.post("/api/triage-all")
async def triage_all_emails(req: TriageRequest = TriageRequest()):
    """
    Batch auto-triage: process multiple emails through the LangGraph pipeline.
    Spam emails are caught by the intake filter instantly (no LLM cost, no delay).
    Legitimate emails are processed sequentially with a delay to avoid rate-limiting.
    """
    from app.config import TRIAGE_DELAY_SECONDS

    target_ids = req.email_ids if req.email_ids else [e["id"] for e in SAMPLE_EMAILS]
    results = {}
    llm_call_count = 0

    for email_id in target_ids:
        try:
            email = get_sample_email(email_id)
        except ValueError:
            continue

        thread_id = f"thread_{email_id}_{uuid.uuid4().hex[:12]}"
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {"email": email}

        # Add delay between LLM calls (not needed for the first call or spam)
        if llm_call_count > 0:
            await asyncio.sleep(TRIAGE_DELAY_SECONDS)

        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(
                None, lambda: graph.invoke(initial_state, config)
            )
            serialized = serialize_state(result)
            results[email_id] = {"thread_id": thread_id, "state": serialized}

            intake = serialized.get("intake_result")
            print(
                f"[TRIAGE] {email.sender_name}: {email.subject} → "
                f"{serialized.get('final_status', '?')} "
                f"(intake={intake or 'full_pipeline'})",
                flush=True
            )

            # Only count as LLM call if it actually went through the LLM
            if intake not in ("spam_filtered", "cache_hit"):
                llm_call_count += 1

        except Exception as e:
            print(f"[TRIAGE ERROR] {email_id}: {e}", flush=True)
            results[email_id] = {
                "thread_id": thread_id,
                "state": {
                    "email": email.model_dump(),
                    "final_status": "error",
                    "processing_log": [f"Triage error: {str(e)}"],
                },
            }
            llm_call_count += 1  # Still count failed LLM attempts

    return results

@app.get("/api/health")
def health():
    return {"status": "ok"}

