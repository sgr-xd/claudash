"""SMTP email channel."""
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def fire(config: dict, rule: dict, event: dict):
    """
    Send alert email via SMTP.
    Config keys: smtp_host, smtp_port, smtp_user, smtp_pass, from, to, subject_prefix
    Env fallback: CLAUDASH_SMTP_* and CLAUDASH_ALERT_FROM / CLAUDASH_ALERT_TO
    """
    smtp_host = config.get("smtp_host") or os.getenv("CLAUDASH_SMTP_HOST", "")
    smtp_port = int(config.get("smtp_port") or os.getenv("CLAUDASH_SMTP_PORT", "587"))
    smtp_user = config.get("smtp_user") or os.getenv("CLAUDASH_SMTP_USER", "")
    smtp_pass = config.get("smtp_pass") or os.getenv("CLAUDASH_SMTP_PASS", "")
    from_addr = config.get("from") or os.getenv("CLAUDASH_ALERT_FROM", smtp_user)
    to_addr = config.get("to") or os.getenv("CLAUDASH_ALERT_TO", "")

    if not smtp_host or not to_addr:
        raise ValueError("Email channel: smtp_host and to address are required")

    prefix = config.get("subject_prefix", "[claudash]")
    subject = f"{prefix} Alert: {rule.get('name', 'Unnamed rule')}"

    body = (
        f"claudash Fleet Monitor — Alert Fired\n\n"
        f"Rule:        {rule.get('name', '')}\n"
        f"Description: {rule.get('description', '')}\n\n"
        f"Employee:    {event.get('employee', 'unknown')}\n"
        f"Tool:        {event.get('tool_name') or event.get('event_type', '')}\n"
        f"Event Type:  {event.get('event_type', '')}\n"
        f"Directory:   {event.get('cwd', '')}\n"
        f"Model:       {event.get('model', '')}\n"
        f"Time:        {event.get('timestamp', datetime.now(timezone.utc).isoformat())}\n\n"
        f"--\nclaudash · Claude Code Fleet Monitor\n"
    )

    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
        server.ehlo()
        if smtp_port != 465:
            server.starttls()
        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)
        server.sendmail(from_addr, [to_addr], msg.as_string())
