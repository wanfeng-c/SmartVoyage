"""Web 服务：FastAPI 提供静态前端、会话接口与 POST /api/chat（SSE）。

启动：uv run python web_service.py（或 uvicorn web_service:app --port 8100）
访问：http://127.0.0.1:8100
"""

import json
import os

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import agent_service

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
PORT = int(os.getenv("WEB_PORT", "8100"))

app = FastAPI(title="SmartVoyage")


class ChatRequest(BaseModel):
    session_id: str = ""
    message: str


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/sessions")
async def sessions():
    return {"sessions": agent_service.list_sessions()}


@app.get("/api/sessions/{session_id}")
async def session_detail(session_id: str):
    session = agent_service.get_session(session_id)
    if not session:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    return {"session": session, "messages": agent_service.session_messages(session_id)}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    message = request.message.strip()
    if not message:
        return JSONResponse({"error": "message 不能为空"}, status_code=400)
    session_id = request.session_id.strip()[:36] or os.urandom(16).hex()

    async def events():
        async for event in agent_service.iter_reply(session_id, message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield 'data: {"type": "done"}\n\n'
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
