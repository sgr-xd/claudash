#!/usr/bin/env node
/**
 * claudash hook agent v1.1.0
 * Receives Claude Code hook events on stdin and POSTs them to the Claudash server.
 *
 * On SessionStart:
 *   - Reads ~/.claude/settings.json and sends registered MCPs + enabled plugins
 *   - Fetches the latest policy and merges it into settings.json
 *   - Checks for a newer version and self-updates if available
 *
 * Config (~/.claude/claudash-config.json or env vars):
 *   url / CLAUDASH_URL         e.g. http://localhost:3365
 *   token / CLAUDASH_TOKEN     dashboard bearer token
 *   employeeId / EMPLOYEE_ID   e.g. alice@company.com
 */
"use strict";

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const os    = require("os");
const crypto = require("crypto");

const AGENT_VERSION  = "1.1.0";
const SETTINGS_PATH  = path.join(os.homedir(), ".claude", "settings.json");
const AGENT_PATH     = path.join(os.homedir(), ".claude", "claudash-hook.js");

// ── Config ───────────────────────────────────────────────────────────────────

let _cfg = {};
try {
  const cfgPath = path.join(os.homedir(), ".claude", "claudash-config.json");
  _cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (_) {}

const CLAUDASH_URL   = process.env.CLAUDASH_URL   || _cfg.url        || "http://localhost:3365";
const CLAUDASH_TOKEN = process.env.CLAUDASH_TOKEN || _cfg.token      || "";
const EMPLOYEE_ID    = process.env.EMPLOYEE_ID    || _cfg.employeeId || os.hostname();

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function post(urlPath, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const url  = new URL(CLAUDASH_URL + urlPath);
    const mod  = url.protocol === "https:" ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        Authorization: `Bearer ${CLAUDASH_TOKEN}`,
      },
      timeout: 4000,
    };
    const req = mod.request(opts, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function get(urlPath) {
  return new Promise((resolve) => {
    const url  = new URL(CLAUDASH_URL + urlPath);
    const mod  = url.protocol === "https:" ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers: { Authorization: `Bearer ${CLAUDASH_TOKEN}` },
      timeout: 4000,
    };
    let body = "";
    const req = mod.request(opts, (res) => {
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, body }); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function getRaw(urlPath) {
  return new Promise((resolve) => {
    const url  = new URL(CLAUDASH_URL + urlPath);
    const mod  = url.protocol === "https:" ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers: { Authorization: `Bearer ${CLAUDASH_TOKEN}` },
      timeout: 8000,
    };
    const chunks = [];
    const req = mod.request(opts, (res) => {
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ── Read registered MCPs and plugins from settings.json ───────────────────────

function readSettingsInfo() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    const mcpServers = settings.mcpServers
      ? Object.keys(settings.mcpServers)
      : [];
    const enabledPlugins = settings.enabledPlugins
      ? Object.entries(settings.enabledPlugins).filter(([, v]) => v !== false).map(([k]) => k)
      : [];
    return { mcpServers, enabledPlugins };
  } catch (_) {
    return { mcpServers: [], enabledPlugins: [] };
  }
}

// ── Policy sync ───────────────────────────────────────────────────────────────

async function syncPolicy() {
  const encodedId = encodeURIComponent(EMPLOYEE_ID);
  const res = await get(`/api/policy/${encodedId}/settings`);
  if (!res) return;
  const fragment = res.body;
  if (!fragment || typeof fragment !== "object" || Object.keys(fragment).length === 0) return;

  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")); } catch {}

  if (fragment.permissions) {
    settings.permissions = settings.permissions || {};
    if (fragment.permissions.allow) {
      const existing = new Set(settings.permissions.allow || []);
      for (const rule of fragment.permissions.allow) existing.add(rule);
      settings.permissions.allow = [...existing];
    }
    if (fragment.permissions.deny) settings.permissions.deny = fragment.permissions.deny;
  }
  if (fragment.mcpServers && Object.keys(fragment.mcpServers).length > 0)
    settings.mcpServers = { ...(settings.mcpServers || {}), ...fragment.mcpServers };
  if (fragment.enabledPlugins && Object.keys(fragment.enabledPlugins).length > 0)
    settings.enabledPlugins = { ...(settings.enabledPlugins || {}), ...fragment.enabledPlugins };
  if (fragment.model) settings.model = fragment.model;

  const tmp = SETTINGS_PATH + ".claudash.tmp";
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, SETTINGS_PATH);
}

// ── Auto-update ───────────────────────────────────────────────────────────────

async function checkAndUpdate() {
  try {
    const res = await get("/api/version");
    if (!res || !res.body) return;
    const serverVersion = res.body.hook_agent_version;
    if (!serverVersion || serverVersion === AGENT_VERSION) return;

    // Download new version
    const newCode = await getRaw("/api/hook-agent");
    if (!newCode || newCode.length < 100) return;

    // Atomic write — replace self
    const tmp = AGENT_PATH + ".update.tmp";
    fs.writeFileSync(tmp, newCode);
    fs.renameSync(tmp, AGENT_PATH);
    fs.chmodSync(AGENT_PATH, 0o755);
    // New version used on next invocation
  } catch (_) {}
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;

  let hook = {};
  try { hook = JSON.parse(raw); } catch { process.exit(0); }

  const eventType = hook.hook_event_name || hook.event_type || hook.hookEventName || "Unknown";

  const promptText =
    hook.prompt ||
    hook.userPrompt ||
    hook.user_prompt ||
    (typeof hook.message === "string" ? hook.message : null) ||
    null;

  const payload = {
    employee:       EMPLOYEE_ID,
    device_id:      os.hostname(),
    session_id:     hook.session_id || hook.sessionId || "unknown",
    event_type:     eventType,
    tool_name:      hook.tool_name || hook.toolName   || null,
    tool_input:     hook.tool_input || hook.toolInput  || null,
    tool_response:  hook.tool_response || hook.toolResponse || null,
    prompt_text:    eventType === "UserPromptSubmit" ? promptText : null,
    cwd:            hook.cwd || process.env.PWD        || null,
    model:          hook.model                         || null,
    claude_version: hook.claude_version                || null,
    timestamp:      new Date().toISOString(),
  };

  // On SessionStart: include registered MCPs and enabled plugins
  if (eventType === "SessionStart") {
    const info = readSettingsInfo();
    payload.mcp_servers     = info.mcpServers;
    payload.enabled_plugins = info.enabledPlugins;
  }

  const postPromise = post("/api/events", payload);

  if (eventType === "SessionStart") {
    await Promise.all([syncPolicy(), checkAndUpdate()]);
  }

  await postPromise;
  process.exit(0);
}

main().catch(() => process.exit(0));
