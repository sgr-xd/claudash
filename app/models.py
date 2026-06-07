from typing import Any, Optional
from pydantic import BaseModel


class HookEvent(BaseModel):
    employee: str
    device_id: Optional[str] = None
    session_id: str
    event_type: str
    tool_name: Optional[str] = None
    tool_input: Optional[dict[str, Any]] = None
    tool_response: Optional[Any] = None
    prompt_text: Optional[str] = None   # UserPromptSubmit content (opt-in via CLAUDASH_CAPTURE_PROMPTS)
    cwd: Optional[str] = None
    model: Optional[str] = None
    claude_version: Optional[str] = None
    timestamp: Optional[str] = None


class PolicyRule(BaseModel):
    allow: list[str] = []
    deny: list[str] = []
    mcpServers: dict[str, Any] = {}
    enabledPlugins: dict[str, bool] = {}
    model: Optional[str] = None


class AlertCondition(BaseModel):
    event_types: list[str] = []       # empty = match any event type
    employees: list[str] = []         # empty = match any employee
    tool_names: list[str] = []        # empty = match any tool (supports glob * patterns)
    input_contains: list[str] = []    # any of these strings found in serialised tool_input
    mcp_only: bool = False            # if true, only match mcp__ tools


class AlertRuleCreate(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    condition: AlertCondition
    channel_ids: list[str] = []
    cooldown_seconds: int = 300


class AlertChannelCreate(BaseModel):
    name: str
    type: str           # "slack" | "webhook" | "email"
    config: dict[str, Any] = {}
    enabled: bool = True
