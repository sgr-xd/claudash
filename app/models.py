from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class HookEvent(BaseModel):
    employee: str
    device_id: Optional[str] = None
    session_id: str
    event_type: str
    tool_name: Optional[str] = None
    tool_input: Optional[Dict[str, Any]] = None
    tool_response: Optional[Any] = None
    prompt_text: Optional[str] = None         # UserPromptSubmit content (opt-in)
    cwd: Optional[str] = None
    model: Optional[str] = None
    claude_version: Optional[str] = None
    timestamp: Optional[str] = None
    # Captured on SessionStart from ~/.claude/settings.json
    mcp_servers: Optional[List[str]] = None   # registered MCP server names
    enabled_plugins: Optional[List[str]] = None  # enabled plugin/skill names


class PolicyRule(BaseModel):
    allow: List[str] = []
    deny: List[str] = []
    mcpServers: Dict[str, Any] = {}
    enabledPlugins: Dict[str, bool] = {}
    model: Optional[str] = None


class AlertCondition(BaseModel):
    event_types: List[str] = []       # empty = match any event type
    employees: List[str] = []         # empty = match any employee
    tool_names: List[str] = []        # supports glob * patterns
    input_contains: List[str] = []    # any of these strings in serialised tool_input
    mcp_only: bool = False            # only match mcp__ tools


class AlertRuleCreate(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    condition: AlertCondition
    channel_ids: List[str] = []
    cooldown_seconds: int = 300


class AlertChannelCreate(BaseModel):
    name: str
    type: str           # "slack" | "webhook" | "email"
    config: Dict[str, Any] = {}
    enabled: bool = True


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"   # "admin" | "viewer"


class SettingsUpdate(BaseModel):
    capture_prompts: Optional[bool] = None
    retention_days: Optional[int] = None
