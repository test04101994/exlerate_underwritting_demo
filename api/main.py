"""
FastAPI application — all HTTP API routes for this project (Python only).

Run: uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from api.routers import auth, credentials, data, jira, submissions

app = FastAPI(title="Project API", version="1.0.0")

_session_secret = os.environ.get("SESSION_SECRET", "your-secret-key")

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3001,http://localhost:5173,http://127.0.0.1:3001").split(
    ","
)
# Starlette: last-added middleware runs first. Add Session, then CORS so CORS is outermost.
app.add_middleware(
    SessionMiddleware,
    secret_key=_session_secret,
    session_cookie="session",
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(credentials.router, prefix="/api")
app.include_router(jira.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}


