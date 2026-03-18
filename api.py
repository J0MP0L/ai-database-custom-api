import os
from dotenv import load_dotenv
import numpy as np
from datetime import datetime, date
from decimal import Decimal
import yaml

# โหลด environment ก่อนทุกอย่าง
load_dotenv(override=True)

from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from code.llm import AIDB
from langchain_core.messages import BaseMessage
import pandas as pd
from plotly.graph_objs import Figure
import plotly.io as pio
from bson import ObjectId
from uuid import UUID
from pymongo import MongoClient

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MONGODB_URI = os.getenv("MONGODB_URI")

app = FastAPI()

app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
app.mount("/code", StaticFiles(directory="code"), name="code")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    user_message: str
    thread_id: str
    owner_id: str

import base64
import numpy as np
import pandas as pd
from datetime import datetime, date

client = MongoClient(os.getenv("MONGODB_URI"))

# 2. สร้าง database และ collection (สร้างอัตโนมัติเมื่อ insert ครั้งแรก)
db = client["chat_db"]
collection = db["chat_history"]

def save_chat(thread_id: str, user_message: str, ai_response: str, asked_at: datetime, answered_at: datetime):
    collection.insert_one({
        "thread_id": thread_id,   # เพิ่มเพื่อให้ load_from_mongodb query ได้
        "asked_at": asked_at,
        "user_message": user_message,
        "answered_at": answered_at,
        "ai_response": ai_response
    })
    
@app.post("/api/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    asked_at = datetime.now()
    ai_response = ""

    async def event_generator():
        nonlocal ai_response
        try:
            async for output in AIDB(
                user_message=request.user_message,
                thread_id=request.thread_id,
                owner_id=request.owner_id
            ):
                # ดึง ai_response จาก final_output
                if "final_output" in output:
                    final = output["final_output"]
                    if final.get("messages"):
                        ai_response = final["messages"][-1].content

                if "supervisor_output" in output:
                    yield f"{output['supervisor_output']}||?||"
                if "mongodb_output" in output:
                    yield f"{output['mongodb_output']}||?||"
                if "graph_ploting" in output:
                    yield f"[CODE]{output['graph_ploting']}||?||"
                if "final_output" in output:
                    yield f"[DONE]{pio.to_json(output['final_output'].get('html_fig', None), validate=False, remove_uids=True)}||?||"

        except Exception as e:
            import traceback
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        
        finally:
            # save หลัง stream จบเสมอ
            if ai_response:
                background_tasks.add_task(
                    save_chat,
                    request.thread_id,
                    request.user_message,
                    ai_response,
                    asked_at,
                    datetime.now()
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

app.mount("/static", StaticFiles(directory="frontend/chat/build/static"), name="static")
@app.get("/")
async def index():
    try:
        with open("frontend/chat/build/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>AI Database API</h1><p>API is running. Use POST /api/chat to interact.</p>")



class PromptUpdate(BaseModel):
    prompt: str

@app.post("/api/update-prompt")
async def update_prompt(data: PromptUpdate):
    # อ่านไฟล์เดิม
    with open('code/prompt/prompt_mockdata.yaml', 'r', encoding='utf-8') as f:
        yaml_data = yaml.safe_load(f)
    
    # อัพเดท prompt
    yaml_data['prompt_database'] = data.prompt
    
    # เขียนกลับ
    with open('code/prompt/prompt_mockdata.yaml', 'w', encoding='utf-8') as f:
        f.write('prompt_mockdata: |\n')
        for line in data.prompt.split('\n'):
            f.write(f'  {line}\n')
    
    return {"status": "success"}


@app.get("/admin")
def admin_prompt():
    try:
        with open("frontend/update_prompt/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>AI Database API</h1><p>API is running. Use POST /api/chat to interact.</p>")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "openrouter_key": "configured" if OPENROUTER_API_KEY else "missing",
        "mongodb_uri": "configured" if MONGODB_URI else "missing"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)