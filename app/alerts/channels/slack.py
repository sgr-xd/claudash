"""Slack incoming webhook channel."""
import json
import os
import urllib.request


def fire(config: dict, rule: dict, event: dict):
    """
    Send a Slack message via incoming webhook.
    Config keys: url (required), username, icon_emoji, channel
    Env fallback: CLAUDASH_SLACK_WEBHOOK
    """
    url = config.get("url") or os.getenv("CLAUDASH_SLACK_WEBHOOK", "")
    if not url:
        raise ValueError("Slack webhook URL not configured")

    employee = event.get("employee", "unknown")
    tool = event.get("tool_name") or event.get("event_type", "")
    cwd = event.get("cwd", "")

    text = (
        f":rotating_light: *claudash alert — {rule.get('name', 'Alert')}*\n"
        f">Employee: `{employee}`\n"
        f">Tool: `{tool}`\n"
        f">Directory: `{cwd}`\n"
        f">Event: `{event.get('event_type', '')}`"
    )
    if rule.get("description"):
        text += f"\n_{rule['description']}_"

    payload: dict = {"text": text}
    if config.get("username"):
        payload["username"] = config["username"]
    if config.get("icon_emoji"):
        payload["icon_emoji"] = config["icon_emoji"]
    if config.get("channel"):
        payload["channel"] = config["channel"]

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        if resp.status not in (200, 204):
            raise RuntimeError(f"Slack responded {resp.status}")
