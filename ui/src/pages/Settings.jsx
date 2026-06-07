import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

// ─── Reusable row ─────────────────────────────────────────────────────────────

function SettingRow({ label, description, children }) {
  return (
    <div style={s.settingRow}>
      <div style={s.settingInfo}>
        <div style={s.settingLabel}>{label}</div>
        {description && <div style={s.settingDesc}>{description}</div>}
      </div>
      <div style={s.settingControl}>{children}</div>
    </div>
  )
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      style={{
        ...s.toggle,
        background: value ? 'var(--accent)' : 'var(--bg-elevated)',
        opacity: disabled ? 0.5 : 1,
      }}
      title={value ? 'Enabled' : 'Disabled'}
    >
      <span style={{ ...s.toggleKnob, transform: value ? 'translateX(18px)' : 'translateX(2px)' }} />
    </button>
  )
}

// ─── Dashboard Settings tab ───────────────────────────────────────────────────

function DashboardSettings() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/api/settings').then(setSettings).catch(() => {})
  }, [])

  async function save(patch) {
    setSaving(true)
    try {
      const updated = await api.put('/api/settings', patch)
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <LoadingSpinner />

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Dashboard Settings</h2>

      <SettingRow
        label="Capture prompt text"
        description="Store the text employees type into Claude (UserPromptSubmit events). Claude's AI responses are never stored. Disabled by default for privacy."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Toggle
            value={settings.capture_prompts}
            onChange={(v) => save({ capture_prompts: v })}
            disabled={saving}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {settings.capture_prompts ? 'On' : 'Off'}
          </span>
        </div>
      </SettingRow>

      <div style={s.divider} />

      <SettingRow
        label="Event retention (days)"
        description="Raw events are automatically deleted after this many days. Session metadata and tool counts are kept forever."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="number"
            min={1}
            max={365}
            value={settings.retention_days}
            onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) })}
            onBlur={() => save({ retention_days: settings.retention_days })}
            style={s.numInput}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days</span>
        </div>
      </SettingRow>

      {saved && (
        <div style={s.savedBanner}>✓ Settings saved</div>
      )}
    </div>
  )
}

// ─── User management tab ──────────────────────────────────────────────────────

function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/users')
      setUsers(res.users || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newUser.username.trim() || !newUser.password) { setError('Username and password required'); return }
    setAdding(true)
    setError(null)
    try {
      await api.post('/api/users', newUser)
      setNewUser({ username: '', password: '', role: 'viewer' })
      setShowAdd(false)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(username) {
    if (!window.confirm(`Delete user ${username}?`)) return
    try {
      await api.delete(`/api/users/${encodeURIComponent(username)}`)
      load()
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  return (
    <div style={s.section}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ ...s.sectionTitle, margin: 0 }}>Users</h2>
        <button onClick={() => { setShowAdd((o) => !o); setError(null) }} style={s.addBtn}>
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
      </div>

      {showAdd && (
        <div style={s.addForm}>
          <input
            placeholder="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            style={s.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            style={s.input}
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            style={s.select}
          >
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <button onClick={handleAdd} disabled={adding} style={s.saveBtn}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {loading ? <LoadingSpinner /> : (
        <div style={s.userList}>
          {users.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No users in database — using env-var credentials.
            </div>
          ) : users.map((u) => (
            <div key={u.username} style={s.userRow}>
              <div style={s.userInfo}>
                <div style={s.userAvatar}>{u.username[0]?.toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {u.role} · joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ ...s.rolePill, ...(u.role === 'admin' ? s.roleAdmin : s.roleViewer) }}>
                  {u.role}
                </span>
                <button onClick={() => handleDelete(u.username)} style={s.deleteBtn}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Install snippet tab ──────────────────────────────────────────────────────

function InstallGuide() {
  const base = window.location.origin
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [tokenLoaded, setTokenLoaded] = useState(false)

  useEffect(() => {
    api.get('/api/settings/agent-token').then((r) => {
      if (r?.token) { setToken(r.token); setTokenLoaded(true) }
    }).catch(() => {})
  }, [])

  function copyToken() {
    if (!token) return
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const displayToken = tokenLoaded ? token : '<your DASHBOARD_TOKEN>'
  const snippet = `# On each employee machine:
CLAUDASH_URL=${base} \\
CLAUDASH_TOKEN=${displayToken} \\
EMPLOYEE_ID=alice@company.com \\
  bash <(curl -sSL ${base}/install/install.sh)

# Restart terminal — events start flowing immediately.
# Hook agent auto-updates on each SessionStart.`

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>Employee Setup</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
        Run this once on each employee machine. The hook agent writes to{' '}
        <code style={s.code}>~/.claude/settings.json</code> and auto-updates on every session start.
      </p>

      {/* Agent token copy */}
      <div style={s.tokenBox}>
        <div style={s.tokenLabel}>Agent Token (DASHBOARD_TOKEN)</div>
        <div style={s.tokenRow}>
          <code style={s.tokenValue}>{tokenLoaded ? token : '—'}</code>
          <button onClick={copyToken} disabled={!tokenLoaded} style={s.copyBtn}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Set this as <code style={s.code}>CLAUDASH_TOKEN</code> on each employee machine.
        </div>
      </div>

      <pre style={s.codePre}>{snippet}</pre>

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ ...s.sectionTitle, fontSize: '13px' }}>For teams behind NAT / firewall</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Employees need network access to the server URL. Options:
        </p>
        <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: 1.8 }}>
          <li><strong>Cloud VM</strong> — deploy claudash on a VPS / Cloud Run with a public IP (recommended for teams)</li>
          <li><strong>Tailscale</strong> — run claudash on any machine inside a Tailscale network; all employees join the tailnet</li>
          <li><strong>Cloudflare Tunnel</strong> — expose localhost with <code style={s.code}>cloudflared tunnel --url http://localhost:3365</code></li>
          <li><strong>ngrok</strong> — quick for testing: <code style={s.code}>ngrok http 3365</code>, use the HTTPS URL</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Dashboard', 'Users', 'Install']

export default function Settings() {
  const [tab, setTab] = useState('Dashboard')

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Settings</h1>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Dashboard' && <DashboardSettings />}
      {tab === 'Users'     && <UserManagement />}
      {tab === 'Install'   && <InstallGuide />}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { padding: '28px 32px', maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  pageHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' },
  tabs: { display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', paddingBottom: '0' },
  tab: { padding: '8px 16px', fontSize: '13px', fontWeight: 500, background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-1px' },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  section: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px' },
  sectionTitle: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px', letterSpacing: '-0.1px' },
  settingRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', padding: '14px 0' },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' },
  settingDesc: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 },
  settingControl: { flexShrink: 0, paddingTop: '2px' },
  divider: { borderTop: '1px solid var(--border)', margin: '4px 0' },
  toggle: { width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 0.2s' },
  toggleKnob: { position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'transform 0.2s' },
  numInput: { width: '72px', padding: '6px 10px', fontSize: '13px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', outline: 'none', textAlign: 'center' },
  savedBanner: { marginTop: '16px', padding: '10px 14px', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--green)' },
  addBtn: { padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  addForm: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  input: { padding: '8px 12px', fontSize: '13px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', outline: 'none', minWidth: '160px' },
  select: { padding: '8px 12px', fontSize: '13px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', cursor: 'pointer' },
  saveBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  error: { padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--red)', marginBottom: '12px' },
  userList: { display: 'flex', flexDirection: 'column', gap: '1px' },
  userRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  userAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 },
  rolePill: { padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 },
  roleAdmin: { background: 'rgba(217,119,6,0.14)', color: 'var(--accent)' },
  roleViewer: { background: 'var(--grey-bg)', color: 'var(--grey)' },
  deleteBtn: { padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '12px', cursor: 'pointer' },
  codePre: { fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', overflowX: 'auto', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  code: { fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '3px', color: 'var(--text-secondary)' },
  tokenBox: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px' },
  tokenLabel: { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' },
  tokenRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  tokenValue: { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: { padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
}
