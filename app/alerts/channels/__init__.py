from app.alerts.channels.slack import fire as fire_slack
from app.alerts.channels.webhook import fire as fire_webhook
from app.alerts.channels.email import fire as fire_email


def fire_channel(channel: dict, rule: dict, event: dict):
    """Dispatch to the correct channel implementation. Raises on failure."""
    ch_type = channel.get("type", "")
    config = channel.get("config", {})
    if ch_type == "slack":
        fire_slack(config, rule, event)
    elif ch_type == "webhook":
        fire_webhook(config, rule, event)
    elif ch_type == "email":
        fire_email(config, rule, event)
    else:
        raise ValueError(f"Unknown channel type: {ch_type!r}")
