"""
AgentCore Submissions — Calculator-only agent for the New Business Submissions workflow.

Runs as a separate service on port 8081 (vs main AgentCore on 8080).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

from strands import Agent
from strands.models.bedrock import BedrockModel
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket

from tools import SUBMISSIONS_TOOLS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agentcore-submissions")

PORT = int(os.environ.get("PORT", "8081"))
_executor = ThreadPoolExecutor(max_workers=4)

# ── Agent Registry ────────────────────────────────────────────────────────────

AGENT_REGISTRY = [
    {
        "id": "calculator",
        "name": "Calculator",
        "description": "Math operations for underwriting",
        "icon": "calculator",
        "capabilities": [
            "Arithmetic (+, -, x, ÷)",
            "Premium calculations",
            "Rate computations",
            "Percentage & ratio",
        ],
        "tools": ["add", "subtract", "multiply", "divide"],
        "examples": [
            "What is 25000 * 0.035?",
            "Calculate premium: $1.2M coverage at 3.5% rate",
            "What's 15% of 84000?",
        ],
    },
    {
        "id": "data_extraction",
        "name": "Data Extraction",
        "description": "Extract insurance fields from PDFs",
        "icon": "scan",
        "capabilities": [
            "Extract policy data from uploaded PDFs",
            "Parse insured name, dates, premiums",
            "Structured field extraction with confidence scores",
        ],
        "tools": ["extract_data"],
        "examples": [
            "Extract data from the uploaded document",
            "Parse the policy details from the PDF",
        ],
    },
    {
        "id": "doc_analysis",
        "name": "Doc Analysis",
        "description": "Analyze and query uploaded documents",
        "icon": "file-search",
        "capabilities": [
            "Answer questions about uploaded documents",
            "Summarize document content",
            "Find specific information in PDFs",
        ],
        "tools": ["doc_analysis"],
        "examples": [
            "What does the uploaded document say about coverage?",
            "Summarize the key terms in this policy",
        ],
    },
]

SYSTEM_PROMPT = """You are an AI Assistant for the New Business Submissions workflow.
You help underwriters with calculations, document analysis, and data extraction.

Available tools: add, subtract, multiply, divide, extract_data, doc_analysis.

RULES:
- ALWAYS use calculator tools for math operations. NEVER calculate in your head.
- For document extraction requests, use extract_data tool immediately.
- For questions about uploaded documents, use doc_analysis tool.
- Be concise and show your work.
- Format currency values with $ and commas.
- For premium calculations: Premium = Coverage × Rate.
- For percentages: use multiply with decimal (e.g., 15% of 100 = multiply(100, 0.15))."""


# ── Agent Sessions ────────────────────────────────────────────────────────────

_sessions: dict[str, Agent] = {}


def create_agent(callback_handler=None) -> Agent:
    model = BedrockModel(
        model_id="amazon.nova-lite-v1:0",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    kwargs = dict(model=model, tools=SUBMISSIONS_TOOLS, system_prompt=SYSTEM_PROMPT)
    if callback_handler:
        kwargs["callback_handler"] = callback_handler
    return Agent(**kwargs)


# ── HTTP Endpoints ────────────────────────────────────────────────────────────

async def health(request: Request):
    return JSONResponse({"status": "healthy", "service": "agentcore-submissions"})


async def list_agents(request: Request):
    return JSONResponse(AGENT_REGISTRY, headers={"Access-Control-Allow-Origin": "*"})


# ── WebSocket Handler ─────────────────────────────────────────────────────────

async def websocket_handler(websocket: WebSocket):
    await websocket.accept()
    session_id = uuid.uuid4().hex[:8]
    logger.info(f"[{session_id}] WebSocket connected")

    ws_queue: asyncio.Queue = asyncio.Queue()

    def callback_handler(event_type, data, **kwargs):
        if event_type == "data" and isinstance(data, str):
            asyncio.get_event_loop().call_soon_threadsafe(
                ws_queue.put_nowait,
                {"type": "agent_response", "content": data, "streaming": True},
            )

    agent = create_agent(callback_handler=callback_handler)
    _sessions[session_id] = agent

    # Drain streaming messages to WebSocket
    async def drain_queue():
        while True:
            msg = await ws_queue.get()
            try:
                await websocket.send_json(msg)
            except Exception:
                break

    drain_task = asyncio.create_task(drain_queue())

    # Keepalive
    async def keepalive():
        try:
            while True:
                await asyncio.sleep(20)
                await websocket.send_json({"type": "pong"})
        except Exception:
            pass

    keepalive_task = asyncio.create_task(keepalive())

    try:
        # Send agent registry on connect
        await websocket.send_json({"type": "agents", "agents": AGENT_REGISTRY})

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"type": "message", "content": raw}

            msg_type = msg.get("type", "message")

            if msg_type in ("ping", "pong"):
                continue
            if msg_type in ("set_ticket_context", "set_workflow_type", "register_session"):
                continue

            if msg_type == "message":
                user_text = msg.get("content", "").strip()
                if not user_text:
                    continue

                logger.info(f"[{session_id}] User: {user_text[:100]}")

                await websocket.send_json({
                    "type": "thinking",
                    "content": "Processing...",
                })

                loop = asyncio.get_event_loop()
                try:
                    result = await loop.run_in_executor(
                        _executor,
                        lambda: agent(user_text),
                    )
                    # Send final response
                    final_text = ""
                    if hasattr(result, "message") and result.message:
                        content_blocks = result.message.get("content", [])
                        for block in content_blocks:
                            if isinstance(block, dict) and "text" in block:
                                final_text += block["text"]
                    if final_text:
                        await websocket.send_json({
                            "type": "agent_response",
                            "content": final_text,
                            "streaming": False,
                        })
                except Exception as e:
                    logger.error(f"[{session_id}] Agent error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Agent error: {str(e)}",
                    })

    except Exception as e:
        logger.info(f"[{session_id}] WebSocket closed: {e}")
    finally:
        drain_task.cancel()
        keepalive_task.cancel()
        _sessions.pop(session_id, None)


# ── App ───────────────────────────────────────────────────────────────────────

app = Starlette(
    routes=[
        Route("/health", health),
        Route("/agents", list_agents),
        WebSocketRoute("/ws", websocket_handler),
    ],
)


if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting AgentCore Submissions on port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
