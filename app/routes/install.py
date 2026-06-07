"""
Serves the hook agent script and installer so employees can curl-install.
No auth required on these endpoints (install bootstrap can't have token yet).
"""

import os
from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse

router = APIRouter()

HOOK_AGENT_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "hook-agent", "claude-hook.js")
INSTALL_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "install.sh")


@router.get("/install/hook-agent.js")
async def serve_hook_agent():
    path = os.path.abspath(HOOK_AGENT_PATH)
    if not os.path.exists(path):
        return PlainTextResponse("Not found", status_code=404)
    return FileResponse(path, media_type="application/javascript")


@router.get("/install/install.sh")
async def serve_install_script():
    path = os.path.abspath(INSTALL_SCRIPT_PATH)
    if not os.path.exists(path):
        return PlainTextResponse("Not found", status_code=404)
    return FileResponse(path, media_type="text/plain")
