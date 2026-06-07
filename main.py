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
from app.routes import events, employees, sessions, analytics, policy, install, alerts, auth as auth_routes


class PermissiveHeadersMiddleware(BaseHTTPMiddleware):
    """Add headers that help Brave and other security-focused browsers trust local scripts."""
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
    """Background thread: mark active sessions as stale if no event in 2 hours.

    Runs every 5 minutes. A session is stale when the last hook event arrived
    more than CLAUDASH_STALE_SESSION_HOURS hours ago (default 2h).  This handles
    crashes, kills, and machines going offline without a Stop hook.
    """
    from datetime import datetime, timezone, timedelta
    from app.db import col

    stale_hours = float(os.getenv("CLAUDASH_STALE_SESSION_HOURS", "2"))
    interval = int(os.getenv("CLAUDASH_REAPER_INTERVAL_SEC", "300"))  # 5 min

    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
            result = col("sessions").update_many(
                {
                    "status": "active",
                    "last_event_at": {"$lt": cutoff, "$exists": True},
                },
                {"$set": {"status": "stale", "ended_at": cutoff}},
            )
            if result.modified_count:
                print(
                    f"[reaper] marked {result.modified_count} session(s) as stale",
                    flush=True,
                )
        except Exception as exc:
            print(f"[reaper] error: {exc}", file=sys.stderr, flush=True)

        time.sleep(interval)


def create_app() -> FastAPI:
    app = FastAPI(title="Claudash — Claude Fleet Monitor", docs_url="/api/docs", redoc_url=None)

    app.add_middleware(PermissiveHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_routes.router, prefix="/api")
    app.include_router(events.router, prefix="/api")
    app.include_router(employees.router, prefix="/api")
    app.include_router(sessions.router, prefix="/api")
    app.include_router(analytics.router, prefix="/api")
    app.include_router(policy.router, prefix="/api")
    app.include_router(install.router)
    app.include_router(alerts.router, prefix="/api")

    # Serve static assets (JS/CSS)
    static_dir = os.path.join(os.path.dirname(__file__), "app", "static")
    if os.path.isdir(static_dir):
        app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    # Catch-all: serve index.html for all non-API routes (React Router SPA)
    # index.html must never be cached so browsers always get the latest bundle reference
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(static_dir, "index.html")
        if os.path.exists(index):
            return FileResponse(
                index,
                headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
            )
        return Response("Not found", status_code=404)

    return app


if __name__ == "__main__":
    ensure_indexes()

    # Start stale session reaper in background daemon thread
    t = threading.Thread(target=_reap_stale_sessions, daemon=True, name="session-reaper")
    t.start()

    port = int(os.getenv("PORT", "3365"))
    print(f"Claudash starting on http://localhost:{port}")
    uvicorn.run(create_app(), host="0.0.0.0", port=port, log_level="info")
