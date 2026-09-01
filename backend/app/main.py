import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    global checkpointer, graph
    with SqliteSaver.from_conn_string("data/checkpoints.sqlite") as saver:
        checkpointer = saver
        builder = create_graph()
        graph = builder.compile(checkpointer=checkpointer)
        yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CorrectionRequest(BaseModel):
    corrected_intent: str
    notes: str

class InfoRequest(BaseModel):
    additional_info: str
    attachments: list[str] = []

@app.get("/api/emails")
def get_emails():
    return SAMPLE_EMAILS

@app.post("/api/process/{email_id}")
def process_email(email_id: str):
    try:
        email = get_sample_email(email_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Email not found")
        
    thread_id = f"thread_{email_id}_{os.urandom(4).hex()}"
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

@app.get("/api/health")
def health():
    return {"status": "ok"}
