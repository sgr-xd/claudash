# claudash

**Claude Code Fleet Monitor** — real-time visibility and policy control for teams running Claude Code at scale.

claudash gives engineering managers insight into every Claude Code session across their organisation: which tools are being used, which MCP servers are active, how long sessions run, and when policy violations occur. It also lets you push `allow`/`deny` policies to employee machines without touching their config manually.

---

## Features

- **Real-time session tracking** — live view of every active session via SSE
- **Per-employee activity** — tool usage, session history, working directories
- **Audit log** — paginated, filterable event stream with **CSV / JSON export**
- **Analytics** — events-per-day and sessions-per-day trends over 7–90 days
- **Alert engine** — fire Slack / webhook / email notifications on matching events
- **Policy editor** — push `allow`/`deny` rules to employee `settings.json` remotely
- **Stale session detection** — sessions with no hook activity for 2h+ are automatically closed
- **Privacy controls** — `CLAUDASH_CAPTURE_PROMPTS=false` by default (AI responses are never stored)
- **30-day event retention** by default, configurable; session metadata kept forever

---

## Quick start

### Option A — Docker (recommended)

```bash
git clone https://github.com/yourorg/claudash.git
cd claudash
cp .env.example .env
# Required: set CLAUDASH_ADMIN_PASS and DASHBOARD_TOKEN in .env
docker compose up -d
```

Open `http://localhost:3365` and sign in with the credentials from `.env`.

### Option B — Local Python

**Requirements:** Python 3.11+, Node 18+, MongoDB 6+

```bash
git clone https://github.com/yourorg/claudash.git
cd claudash

# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit: set CLAUDASH_ADMIN_PASS, DASHBOARD_TOKEN

# Frontend (first time or after UI changes)
cd ui && npm install && npm run build && cd ..

# Start MongoDB (adjust path for your system)
mongod --dbpath /data/db --fork --logpath /tmp/mongod.log

# Start the server
python main.py
```

---

## Employee setup — hook agent

Run once on each employee machine (or push via MDM/Ansible):

```bash
CLAUDASH_URL=http://your-server:3365 \
CLAUDASH_TOKEN=<DASHBOARD_TOKEN> \
EMPLOYEE_ID=alice@company.com \
  bash <(curl -sSL http://your-server:3365/install/install.sh)
```

This script:
1. Downloads `claudash-hook.js` to `~/.claude/`
2. Writes `~/.claude/claudash-config.json` (server URL + employee identity)
3. Merges monitoring hooks into `~/.claude/settings.json` without overwriting existing config

Hooks fire on: `SessionStart`, `PostToolUse`, `PreToolUse`, `PermissionRequest`, `Stop`, `UserPromptSubmit`.

---

## Configuration

All settings in `.env` (never committed). See `.env.example` for the full list.

| Variable | Default | Description |
|---|---|---|
| `CLAUDASH_ADMIN_USER` | `admin` | Dashboard login username |
| `CLAUDASH_ADMIN_PASS` | *(required)* | Dashboard login password |
| `CLAUDASH_JWT_SECRET` | auto-generated | JWT signing key — set to persist sessions across restarts |
| `CLAUDASH_JWT_EXPIRE_HOURS` | `24` | JWT token expiry |
| `DASHBOARD_TOKEN` | *(required)* | Bearer token used by hook agents |
| `MONGODB_URI` | `mongodb://localhost:27017/claudash` | MongoDB connection string |
| `PORT` | `3365` | HTTP port |
| `CLAUDASH_CAPTURE_PROMPTS` | `false` | Store user prompt text (opt-in) |
| `CLAUDASH_RETENTION_DAYS` | `30` | Raw event TTL in days |
| `CLAUDASH_STALE_SESSION_HOURS` | `2` | Hours before an active session is marked stale |
| `CLAUDASH_SLACK_WEBHOOK` | — | Slack incoming webhook URL |

---

## Policy control

From the **Policy** page (or API), create rules per employee or a `default` that applies to everyone:

```json
{
  "allow": ["python *", "git *", "npm *"],
  "deny":  ["rm -rf *", "sudo *"],
  "model": "claude-haiku-4-5",
  "enabledPlugins": { "slack": false }
}
```

On the employee's next `SessionStart`, their `~/.claude/settings.json` is automatically merged with the latest policy from the server.

---

## Architecture

```
Employee machine                    Server (claudash)
────────────────                    ─────────────────────────────────
~/.claude/settings.json             FastAPI + MongoDB
  hooks → claudash-hook.js ──────►  POST /api/events      ← hook payloads
          (claudash-config.json)    GET  /api/policy/:id   ← policy fetch
                                    GET  /api/events/stream ← SSE to UI
                                    GET  /api/employees     ← fleet view
                                    GET  /api/analytics     ← trends
```

---

## Development

```bash
# Backend (hot reload)
source .venv/bin/activate
uvicorn main:create_app --factory --reload --port 3365

# Frontend dev server (separate terminal, proxies /api → :3365)
cd ui && npm run dev
```

---

## License

MIT — see [LICENSE](LICENSE).
