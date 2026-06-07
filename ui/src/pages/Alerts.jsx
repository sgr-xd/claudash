import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, parseUTC } from '../api.js'
import Badge from '../components/Badge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

const CHANNEL_TYPES = ['slack', 'webhook', 'email']

function fmtDate(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Channel form fields by type ─────────────────────────────────────────────

function ChannelFields({ type, config, onChange }) {
  const set = (k, v) => onChange({ ...config, [k]: v })
  if (type === 'slack') return (
    <div style={s.fieldGroup}>
      <Field label="Webhook URL *" value={config.url || ''} onChange={(v) => set('url', v)} placeholder="https://hooks.slack.com/services/..." />
      <Field label="Channel" value={config.channel || ''} onChange={(v) => set('channel', v)} placeholder="#security-alerts (optional)" />
      <Field label="Username" value={config.username || ''} onChange={(v) => set('username', v)} placeholder="claudash (optional)" />
      <Field label="Icon Emoji" value={config.icon_emoji || ''} onChange={(v) => set('icon_emoji', v)} placeholder=":robot_face: (optional)" />
    </div>
  )
  if (type === 'webhook') return (
    <div style={s.fieldGroup}>
      <Field label="Webhook URL *" value={config.url || ''} onChange={(v) => set('url', v)} placeholder="https://your-server.com/webhook" />
      <Field label="Secret (Bearer token)" value={config.secret || ''} onChange={(v) => set('secret', v)} placeholder="optional" type="password" />
      <Field label="HTTP Method" value={config.method || 'POST'} onChange={(v) => set('method', v)} placeholder="POST" />
    </div>
  )
  if (type === 'email') return (
    <div style={s.fieldGroup}>
      <Field label="To Address *" value={config.to || ''} onChange={(v) => set('to', v)} placeholder="security@company.com" />
      <Field label="From Address" value={config.from || ''} onChange={(v) => set('from', v)} placeholder="claudash@company.com" />
      <Field label="SMTP Host *" value={config.smtp_host || ''} onChange={(v) => set('smtp_host', v)} placeholder="smtp.gmail.com" />
      <Field label="SMTP Port" value={config.smtp_port || '587'} onChange={(v) => set('smtp_port', v)} placeholder="587" />
      <Field label="SMTP User" value={config.smtp_user || ''} onChange={(v) => set('smtp_user', v)} placeholder="user@gmail.com" />
      <Field label="SMTP Password" value={config.smtp_pass || ''} onChange={(v) => set('smtp_pass', v)} placeholder="••••••••" type="password" />
      <Field label="Subject Prefix" value={config.subject_prefix || '[claudash]'} onChange={(v) => set('subject_prefix', v)} placeholder="[claudash]" />
    </div>
  )
  return null
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={s.fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={s.input}
      />
    </div>
  )
}

// ─── Channel Modal ────────────────────────────────────────────────────────────

function ChannelModal({ channel, onClose, onSave, onTest }) {
  const [form, setForm] = useState(channel || { name: '', type: 'slack', config: {}, enabled: true })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleTest() {
    if (!channel?.id) return
    setTesting(true)
    setTestResult(null)
    try {
      await onTest(channel.id)
      setTestResult({ ok: true, msg: 'Test sent successfully' })
    } catch (e) {
      setTestResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHead}>
          <h2 style={s.modalTitle}>{channel ? 'Edit Channel' : 'Add Channel'}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="My Slack Channel" />
          <div style={{ marginBottom: '12px' }}>
            <label style={s.fieldLabel}>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, config: {} })} style={s.input}>
              {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <ChannelFields type={form.type} config={form.config} onChange={(cfg) => setForm({ ...form, config: cfg })} />
          <label style={{ ...s.fieldLabel, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enabled
          </label>
        </div>
        <div style={s.modalFoot}>
          {channel?.id && (
            <button onClick={handleTest} disabled={testing} style={s.testBtn}>
              {testing ? 'Sending…' : 'Send Test'}
            </button>
          )}
          {testResult && (
            <span style={{ fontSize: '12px', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
              {testResult.msg}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={s.saveBtn}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────

function RuleModal({ rule, channels, onClose, onSave }) {
  const [form, setForm] = useState(rule || {
    name: '', description: '', enabled: true,
    condition: { event_types: [], employees: [], tool_names: [], input_contains: [], mcp_only: false },
    channel_ids: [], cooldown_seconds: 300,
  })
  const [saving, setSaving] = useState(false)

  const setCondition = (k, v) => setForm({ ...form, condition: { ...form.condition, [k]: v } })
  const parseLines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean)
  const joinLines = (arr) => (arr || []).join('\n')

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHead}>
          <h2 style={s.modalTitle}>{rule ? 'Edit Rule' : 'Add Alert Rule'}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Detect sudo commands" />
          <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional description" />

          <div style={s.sectionLabel}>CONDITIONS (all must match)</div>

          <TextareaField
            label="Event Types (one per line, empty = any)"
            value={joinLines(form.condition.event_types)}
            onChange={(v) => setCondition('event_types', parseLines(v))}
            placeholder={'PostToolUse\nPermissionRequest'}
            rows={2}
          />
          <TextareaField
            label="Tool Names (one per line, glob ok, empty = any)"
            value={joinLines(form.condition.tool_names)}
            onChange={(v) => setCondition('tool_names', parseLines(v))}
            placeholder={'Bash\nmcp__slack__*'}
            rows={2}
          />
          <TextareaField
            label="Input Contains (any of these keywords in tool_input)"
            value={joinLines(form.condition.input_contains)}
            onChange={(v) => setCondition('input_contains', parseLines(v))}
            placeholder={'sudo\nrm -rf\n/etc/passwd'}
            rows={3}
          />
          <TextareaField
            label="Restrict to Employees (one email per line, empty = any)"
            value={joinLines(form.condition.employees)}
            onChange={(v) => setCondition('employees', parseLines(v))}
            placeholder={'alice@company.com'}
            rows={2}
          />
          <label style={{ ...s.fieldLabel, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
            <input type="checkbox" checked={form.condition.mcp_only} onChange={(e) => setCondition('mcp_only', e.target.checked)} />
            Only match MCP tool calls
          </label>

          <div style={s.sectionLabel}>ACTIONS</div>

          <div style={{ marginBottom: '12px' }}>
            <label style={s.fieldLabel}>Notify Channels</label>
            {channels.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 8px' }}>No channels configured yet — add one first.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {channels.map((ch) => (
                  <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.channel_ids.includes(ch.id)}
                      onChange={(e) => {
                        const ids = form.channel_ids.filter((i) => i !== ch.id)
                        if (e.target.checked) ids.push(ch.id)
                        setForm({ ...form, channel_ids: ids })
                      }}
                    />
                    <span style={s.chTypeBadge}>{ch.type}</span>
                    {ch.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={s.fieldLabel}>Cooldown (seconds between re-fires)</label>
            <input
              type="number"
              value={form.cooldown_seconds}
              onChange={(e) => setForm({ ...form, cooldown_seconds: parseInt(e.target.value) || 300 })}
              style={{ ...s.input, maxWidth: '120px' }}
              min={0}
            />
          </div>

          <label style={{ ...s.fieldLabel, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enabled
          </label>
        </div>
        <div style={s.modalFoot}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={s.saveBtn}>
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Alert Templates ──────────────────────────────────────────────────────────

const ALERT_TEMPLATES = [
  {
    name: 'Policy block detected',
    description: 'Fires whenever an employee tries to use a tool that is blocked by policy.',
    condition: { event_types: ['ToolBlocked'], employees: [], tool_names: [], input_contains: [], mcp_only: false },
    cooldown_seconds: 60,
  },
  {
    name: 'Network command in Bash',
    description: 'Detects curl, wget, or nc used inside Bash — common in data exfiltration or unvetted downloads.',
    condition: { event_types: ['PostToolUse'], employees: [], tool_names: ['Bash'], input_contains: ['curl ', 'wget ', ' nc '], mcp_only: false },
    cooldown_seconds: 300,
  },
  {
    name: 'Slack MCP used',
    description: 'Any call to the Slack MCP server (sending messages, reading channels, etc.).',
    condition: { event_types: ['PostToolUse'], employees: [], tool_names: ['mcp__slack__*'], input_contains: [], mcp_only: true },
    cooldown_seconds: 0,
  },
  {
    name: 'Sensitive file written',
    description: 'Detects writes to .env, credentials, or secrets files.',
    condition: { event_types: ['PostToolUse'], employees: [], tool_names: ['Write', 'Edit'], input_contains: ['.env', 'credentials', 'secrets', 'private_key'], mcp_only: false },
    cooldown_seconds: 300,
  },
  {
    name: 'Sudo or root command',
    description: 'Bash commands that use sudo, su, or chown — may indicate privilege escalation.',
    condition: { event_types: ['PostToolUse'], employees: [], tool_names: ['Bash'], input_contains: ['sudo ', 'su -', 'chown ', 'chmod 777'], mcp_only: false },
    cooldown_seconds: 300,
  },
]

function TemplatesPanel({ onUse }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={s.templatesWrap}>
      <button onClick={() => setOpen((o) => !o)} style={s.templatesTrigger}>
        {open ? '▲' : '▼'} Starter templates ({ALERT_TEMPLATES.length})
      </button>
      {open && (
        <div style={s.templatesList}>
          {ALERT_TEMPLATES.map((t) => (
            <div key={t.name} style={s.templateRow}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.description}</div>
              </div>
              <button onClick={() => { onUse(t); setOpen(false) }} style={s.useTemplateBtn}>
                Use →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TextareaField({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={s.fieldLabel}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...s.input, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Alerts() {
  const [rules, setRules] = useState([])
  const [channels, setChannels] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('rules') // 'rules' | 'channels' | 'history'
  const [ruleModal, setRuleModal] = useState(null)   // null | {} | rule
  const [channelModal, setChannelModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [rulesRes, chRes, histRes] = await Promise.all([
        api.get('/api/alerts/rules'),
        api.get('/api/alerts/channels'),
        api.get('/api/alerts/history?limit=50'),
      ])
      setRules(rulesRes?.rules || [])
      setChannels(chRes?.channels || [])
      setHistory(histRes?.history || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveRule(form) {
    const body = {
      name: form.name, description: form.description, enabled: form.enabled,
      condition: form.condition, channel_ids: form.channel_ids,
      cooldown_seconds: form.cooldown_seconds,
    }
    if (form.id) {
      await api.put(`/api/alerts/rules/${form.id}`, body)
    } else {
      await api.post('/api/alerts/rules', body)
    }
    setRuleModal(null)
    load()
  }

  async function toggleRule(rule) {
    await api.patch(`/api/alerts/rules/${rule.id}/toggle`, {})
    load()
  }

  async function deleteRule(id) {
    if (!window.confirm('Delete this rule?')) return
    await api.delete(`/api/alerts/rules/${id}`)
    load()
  }

  async function saveChannel(form) {
    const body = { name: form.name, type: form.type, config: form.config, enabled: form.enabled }
    if (form.id) {
      await api.put(`/api/alerts/channels/${form.id}`, body)
    } else {
      await api.post('/api/alerts/channels', body)
    }
    setChannelModal(null)
    load()
  }

  async function testChannel(id) {
    const res = await api.post(`/api/alerts/channels/${id}/test`, {})
    if (!res?.ok) throw new Error(res?.message || 'Test failed')
  }

  async function deleteChannel(id) {
    if (!window.confirm('Delete this channel?')) return
    await api.delete(`/api/alerts/channels/${id}`)
    load()
  }

  if (loading) return <LoadingSpinner center />
  if (error) return <div style={{ padding: '40px', color: 'var(--red)' }}><strong>Error:</strong> {error}</div>

  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c]))

  return (
    <div style={s.page}>
      {ruleModal !== null && (
        <RuleModal
          rule={ruleModal?.id ? ruleModal : null}
          channels={channels}
          onClose={() => setRuleModal(null)}
          onSave={saveRule}
        />
      )}
      {channelModal !== null && (
        <ChannelModal
          channel={channelModal?.id ? channelModal : null}
          onClose={() => setChannelModal(null)}
          onSave={saveChannel}
          onTest={testChannel}
        />
      )}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Alerts</h1>
          <p style={s.pageSubtitle}>
            {rules.length} rule{rules.length !== 1 ? 's' : ''} · {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setChannelModal({})} style={s.secondaryBtn}>+ Add Channel</button>
          <button onClick={() => setRuleModal({})} style={s.primaryBtn}>+ Add Rule</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[['rules', `Rules (${rules.length})`], ['channels', `Channels (${channels.length})`], ['history', `History (${history.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div style={s.cardList}>
          <TemplatesPanel onUse={(t) => setRuleModal({ ...t, channel_ids: [], enabled: true })} />
          {rules.length === 0 ? (
            <EmptyState msg="No alert rules yet — use a template above or add one manually." cta="+ Add Rule" onClick={() => setRuleModal({})} />
          ) : rules.map((rule) => (
            <div key={rule.id} style={{ ...s.ruleCard, opacity: rule.enabled ? 1 : 0.55 }}>
              <div style={s.ruleTop}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ ...s.dot, background: rule.enabled ? 'var(--green)' : 'var(--border)' }} />
                  <span style={s.ruleName}>{rule.name}</span>
                  {rule.description && <span style={s.ruleDesc}>{rule.description}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setRuleModal(rule)} style={s.actionBtn}>Edit</button>
                  <button onClick={() => toggleRule(rule)} style={s.actionBtn}>{rule.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => deleteRule(rule.id)} style={{ ...s.actionBtn, color: 'var(--red)' }}>Delete</button>
                </div>
              </div>
              <div style={s.ruleMeta}>
                {rule.condition?.event_types?.length > 0 && (
                  <span style={s.chip}>Events: {rule.condition.event_types.join(', ')}</span>
                )}
                {rule.condition?.tool_names?.length > 0 && (
                  <span style={s.chip}>Tools: {rule.condition.tool_names.join(', ')}</span>
                )}
                {rule.condition?.input_contains?.length > 0 && (
                  <span style={s.chip}>Contains: {rule.condition.input_contains.join(', ')}</span>
                )}
                {rule.condition?.mcp_only && <span style={{ ...s.chip, background: 'var(--purple-bg)', color: 'var(--purple)' }}>MCP only</span>}
                {rule.channel_ids?.length > 0 && (
                  <span style={{ ...s.chip, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    → {rule.channel_ids.map((id) => channelMap[id]?.name || id).join(', ')}
                  </span>
                )}
                <span style={{ ...s.chip, marginLeft: 'auto', fontSize: '11px' }}>
                  cooldown {rule.cooldown_seconds}s
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Channels tab */}
      {tab === 'channels' && (
        <div style={s.cardList}>
          {channels.length === 0 ? (
            <EmptyState msg="No channels configured. Add one to receive alerts." cta="+ Add Channel" onClick={() => setChannelModal({})} />
          ) : channels.map((ch) => (
            <div key={ch.id} style={{ ...s.ruleCard, opacity: ch.enabled ? 1 : 0.55 }}>
              <div style={s.ruleTop}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ ...s.dot, background: ch.enabled ? 'var(--green)' : 'var(--border)' }} />
                  <span style={s.chTypeBadge}>{ch.type}</span>
                  <span style={s.ruleName}>{ch.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setChannelModal(ch)} style={s.actionBtn}>Edit</button>
                  <button onClick={() => testChannel(ch.id).then(() => alert('Test sent!')).catch((e) => alert('Error: ' + e.message))} style={s.actionBtn}>Test</button>
                  <button onClick={() => deleteChannel(ch.id)} style={{ ...s.actionBtn, color: 'var(--red)' }}>Delete</button>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Updated {fmtDate(ch.updated_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={s.card}>
          {history.length === 0 ? (
            <div style={s.emptyInCard}>No alerts fired yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Fired At', 'Rule', 'Employee', 'Event', 'Tool', 'Dir'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} style={s.tr}>
                      <td style={{ ...s.td, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{fmtDate(h.fired_at)}</td>
                      <td style={{ ...s.td, fontWeight: 500 }}>{h.rule_name}</td>
                      <td style={s.td}>{h.employee || '—'}</td>
                      <td style={s.td}><Badge type={h.event_type} label={h.event_type} /></td>
                      <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{h.tool_name || '—'}</td>
                      <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {h.cwd ? h.cwd.split('/').slice(-2).join('/') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ msg, cta, onClick }) {
  return (
    <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>{msg}</div>
      {cta && <button onClick={onClick} style={s.primaryBtn}>{cta}</button>}
    </div>
  )
}

const s = {
  page: { padding: '28px 32px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  pageTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' },
  pageSubtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' },
  tabs: { display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', paddingBottom: '0' },
  tab: { padding: '8px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500, marginBottom: '-1px' },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  ruleCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' },
  ruleTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  ruleName: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' },
  ruleDesc: { fontSize: '12px', color: 'var(--text-muted)' },
  ruleMeta: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' },
  chip: { padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' },
  chTypeBadge: { padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  actionBtn: { padding: '4px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' },
  modalBody: { padding: '20px 24px', overflowY: 'auto', flex: 1 },
  modalFoot: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 24px', borderTop: '1px solid var(--border)' },
  sectionLabel: { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 12px', borderTop: '1px solid var(--border)', paddingTop: '16px' },
  fieldGroup: {},
  fieldLabel: { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '5px' },
  input: { width: '100%', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  saveBtn: { padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' },
  testBtn: { padding: '8px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' },
  // Templates
  templatesWrap: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  templatesTrigger: { width: '100%', padding: '12px 18px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.04em' },
  templatesList: { borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column' },
  templateRow: { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 18px', borderBottom: '1px solid var(--border)' },
  useTemplateBtn: { padding: '5px 12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  // History table
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  emptyInCard: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tr: {},
}
