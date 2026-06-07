#!/usr/bin/env bash
# claudash install script
# Usage: curl -sSL https://<your-server>/install.sh | CLAUDASH_URL=http://... EMPLOYEE_ID=you@co.com bash
# Or:    CLAUDASH_URL=http://localhost:3365 EMPLOYEE_ID=you@company.com bash install.sh

set -euo pipefail

CLAUDASH_URL="${CLAUDASH_URL:-http://localhost:3365}"
EMPLOYEE_ID="${EMPLOYEE_ID:-$(git config --global user.email 2>/dev/null || hostname)}"
CLAUDASH_TOKEN="${CLAUDASH_TOKEN:-}"

CLAUDE_DIR="$HOME/.claude"
HOOK_SCRIPT="$CLAUDE_DIR/claudash-hook.js"
CONFIG_FILE="$CLAUDE_DIR/claudash-config.json"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "╔══════════════════════════════════════════╗"
echo "║  claudash — Claude Fleet Monitor Agent   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Server : $CLAUDASH_URL"
echo "  User   : $EMPLOYEE_ID"
echo ""

mkdir -p "$CLAUDE_DIR"

# ── 1. Download hook agent ────────────────────────────────────────────────────
echo "→ Installing hook agent..."
if command -v curl &>/dev/null; then
  curl -sSfL "$CLAUDASH_URL/install/hook-agent.js" -o "$HOOK_SCRIPT"
elif command -v wget &>/dev/null; then
  wget -qO "$HOOK_SCRIPT" "$CLAUDASH_URL/install/hook-agent.js"
else
  echo "✗ Neither curl nor wget found. Install one and retry."
  exit 1
fi
chmod +x "$HOOK_SCRIPT"
echo "  Saved to $HOOK_SCRIPT"

# ── 2. Write claudash-config.json ─────────────────────────────────────────────
# This file is read by the hook agent so it works in both terminal and
# the Claude desktop app (which doesn't load .zshrc env vars).
echo "→ Writing config file..."
node - <<JSEOF
const fs = require('fs');
const configPath = '$CONFIG_FILE';
let existing = {};
try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
const updated = { ...existing, url: '$CLAUDASH_URL', employeeId: '$EMPLOYEE_ID' };
if ('$CLAUDASH_TOKEN') updated.token = '$CLAUDASH_TOKEN';
fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
console.log('  Config written to ' + configPath);
JSEOF

# ── 3. Merge hooks into ~/.claude/settings.json ───────────────────────────────
echo "→ Merging hooks into settings.json..."
node - <<JSEOF
const fs = require('fs');
const settingsPath = '$SETTINGS';
const hookScript = '$HOOK_SCRIPT';

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
settings.hooks = settings.hooks || {};

function ensureHook(eventName, command) {
  settings.hooks[eventName] = settings.hooks[eventName] || [];
  const already = settings.hooks[eventName].some(g =>
    g.hooks && g.hooks.some(h => h.command && h.command.includes('claudash-hook.js'))
  );
  if (!already) {
    settings.hooks[eventName].push({
      matcher: '',
      hooks: [{ type: 'command', command, timeout: 10 }],
    });
  }
}

const cmd = 'node ' + hookScript;
ensureHook('SessionStart', cmd);
ensureHook('PreToolUse', cmd);
ensureHook('PostToolUse', cmd);
ensureHook('Stop', cmd);
ensureHook('PermissionRequest', cmd);
ensureHook('UserPromptSubmit', cmd);

const tmp = settingsPath + '.claudash.tmp';
fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
fs.renameSync(tmp, settingsPath);
console.log('  Hooks merged into ' + settingsPath);
JSEOF

# ── 4. Add env vars to shell rc ───────────────────────────────────────────────
echo "→ Adding env vars to shell profile..."
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then SHELL_RC="$HOME/.bash_profile"
fi

add_env_var() {
  local rc="$1" key="$2" val="$3"
  if ! grep -q "export $key=" "$rc" 2>/dev/null; then
    printf '\n# claudash fleet monitor\nexport %s="%s"\n' "$key" "$val" >> "$rc"
    echo "  Added $key to $rc"
  else
    echo "  $key already set in $rc (skipped)"
  fi
}

if [ -n "$SHELL_RC" ]; then
  add_env_var "$SHELL_RC" "CLAUDASH_URL" "$CLAUDASH_URL"
  add_env_var "$SHELL_RC" "EMPLOYEE_ID" "$EMPLOYEE_ID"
  [ -n "$CLAUDASH_TOKEN" ] && add_env_var "$SHELL_RC" "CLAUDASH_TOKEN" "$CLAUDASH_TOKEN"
else
  echo "  ⚠ Could not detect shell rc. Add these manually:"
  echo "    export CLAUDASH_URL=\"$CLAUDASH_URL\""
  echo "    export EMPLOYEE_ID=\"$EMPLOYEE_ID\""
  [ -n "$CLAUDASH_TOKEN" ] && echo "    export CLAUDASH_TOKEN=\"$CLAUDASH_TOKEN\""
fi

# ── 5. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "✓ claudash agent installed successfully!"
echo ""
echo "  Restart your terminal (or: source $SHELL_RC)"
echo "  Then open Claude Code — events will flow to $CLAUDASH_URL"
echo ""
