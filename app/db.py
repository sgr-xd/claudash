import os
from pymongo import MongoClient, ASCENDING, DESCENDING

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/claudash")
MONGO_DB = os.getenv("MONGODB_DB", "claudash")
RETENTION_DAYS = int(os.getenv("CLAUDASH_RETENTION_DAYS", "30"))

_client = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client[MONGO_DB]


def col(name: str):
    return get_db()[name]


def ensure_indexes():
    db = get_db()

    # TTL index on events.timestamp — configurable via CLAUDASH_RETENTION_DAYS
    for old_name in ("timestamp_-1", "events_ttl"):
        try:
            db["events"].drop_index(old_name)
        except Exception:
            pass
    db["events"].create_index(
        [("timestamp", DESCENDING)],
        expireAfterSeconds=RETENTION_DAYS * 86_400,
        name="events_ttl",
    )
    db["events"].create_index([("employee", ASCENDING), ("timestamp", DESCENDING)])
    db["events"].create_index([("session_id", ASCENDING)])
    db["events"].create_index([("event_type", ASCENDING), ("timestamp", DESCENDING)])
    db["events"].create_index([("tool_name", ASCENDING), ("timestamp", DESCENDING)])

    db["sessions"].create_index([("started_at", DESCENDING)])
    db["sessions"].create_index([("employee", ASCENDING), ("started_at", DESCENDING)])
    db["sessions"].create_index([("session_id", ASCENDING)], unique=True)
    db["sessions"].create_index([("status", ASCENDING), ("last_event_at", ASCENDING)])

    db["employees"].create_index([("email", ASCENDING)], unique=True)
    db["policies"].create_index([("employee_id", ASCENDING)], unique=True)

    # Alert rules & channels
    db["alert_rules"].create_index([("enabled", ASCENDING)])
    db["alert_channels"].create_index([("type", ASCENDING)])

    # Alert history TTL — same retention as events
    for old_name in ("fired_at_-1", "alert_history_ttl"):
        try:
            db["alert_history"].drop_index(old_name)
        except Exception:
            pass
    db["alert_history"].create_index(
        [("fired_at", DESCENDING)],
        expireAfterSeconds=RETENTION_DAYS * 86_400,
        name="alert_history_ttl",
    )
    db["alert_history"].create_index([("rule_id", ASCENDING), ("fired_at", DESCENDING)])
    db["alert_history"].create_index([("employee", ASCENDING), ("fired_at", DESCENDING)])
