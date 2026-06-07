from __future__ import annotations

import os
import sys
import threading
import time

from dotenv import load_dotenv
load_dotenv()

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.db import ensure_indexes
from app.routes import events, employees, sessions, analytics, policy, install, alerts
from app.routes import auth as auth_routes
from app.routes import settings as settings_routes

APP_VERSION = "1.2.0"
HOOK_AGENT_VERSION = "1.2.0"


class PermissiveHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response


# ── Stale session reaper ──────────────────────────────────────────────────────

def _reap_stale_sessions():
    from datetime import datetime, timezone, timedelta
    from app.db import col

    stale_hours = float(os.getenv("CLAUDASH_STALE_SESSION_HOURS", "2"))
    interval = int(os.getenv("CLAUDASH_REAPER_INTERVAL_SEC", "300"))

    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
            result = col("sessions").update_many(
                {"status": "active", "last_event_at": {"$lt": cutoff, "$exists": True}},
                {"$set": {"status": "stale", "ended_at": cutoff}},
            )
            if result.modified_count:
                print(f"[reaper] marked {result.modified_count} session(s) as stale", flush=True)
        except Exception as exc:
            print(f"[reaper] error: {exc}", file=sys.stderr, flush=True)
        time.sleep(interval)


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(title="Claudash", docs_url="/api/docs", redoc_url=None)

    app.add_middleware(PermissiveHeadersMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    # API routes
    app.include_router(auth_routes.router, prefix="/api")
    app.include_router(events.router, prefix="/api")
    app.include_router(employees.router, prefix="/api")
    app.include_router(sessions.router, prefix="/api")
    app.include_router(analytics.router, prefix="/api")
    app.include_router(policy.router, prefix="/api")
    app.include_router(settings_routes.router, prefix="/api")
    app.include_router(install.router)
    app.include_router(alerts.router, prefix="/api")

    # Version endpoint (used by hook agent for auto-update check)
    @app.get("/api/version")
    async def version():
        return {"app_version": APP_VERSION, "hook_agent_version": HOOK_AGENT_VERSION}

    # Serve the latest hook agent JS (used by auto-update)
    @app.get("/api/hook-agent")
    async def serve_hook_agent():
        agent_path = os.path.join(os.path.dirname(__file__), "hook-agent", "claude-hook.js")
        if os.path.exists(agent_path):
            return FileResponse(agent_path, media_type="application/javascript")
        return Response("Not found", status_code=404)

    # Serve static assets (JS/CSS bundles)
    static_dir = os.path.join(os.path.dirname(__file__), "app", "static")
    if os.path.isdir(static_dir):
        app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    # SPA catch-all
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(static_dir, "index.html")
        if os.path.exists(index):
            return FileResponse(index, headers={"Cache-Control": "no-store, no-cache, must-revalidate"})
        return Response("Not found", status_code=404)

    return app


if __name__ == "__main__":
    ensure_indexes()
    threading.Thread(target=_reap_stale_sessions, daemon=True, name="session-reaper").start()
    port = int(os.getenv("PORT", "3365"))
    print(f"Claudash {APP_VERSION} starting on http://localhost:{port}")
    uvicorn.run(create_app(), host="0.0.0.0", port=port, log_level="info")
