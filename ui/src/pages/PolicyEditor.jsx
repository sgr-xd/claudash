import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAgo(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'Never'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function PolicyModal({ policy, onClose, onSaved }) {
  const isNew = !policy.employee_id
  const [employeeId, setEmployeeId] = useState(policy.employee_id || '')
  const [allow, setAllow] = useState((policy.allow || []).join('\n'))
  const [deny, setDeny] = useState((policy.deny || []).join('\n'))
  const [model, setModel] = useState(policy.model || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    const id = employeeId.trim()
    if (!id) { setError('Employee ID / email is required'); return }
    setSaving(true)
    setError(null)
    try {
      const body = {
        allow: allow.split('\n').map((l) => l.trim()).filter(Boolean),
        deny: deny.split('\n').map((l) => l.trim()).filter(Boolean),
        mcpServers: policy.mcpServers || {},
        enabledPlugins: policy.enabledPlugins || {},
        model: model.trim(),
      }
      await api.put(`/api/policy/${encodeURIComponent(id)}`, body)
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={m.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={m.modal}>
        <div style={m.modalHeader}>
          <h2 style={m.modalTitle}>{isNew ? 'Add Policy' : 'Edit Policy'}</h2>
          <button onClick={onClose} style={m.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={m.body}>
          <Field label="Employee ID / Email">
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="user@company.com or default"
              disabled={!isNew}
              style={{ ...m.input, opacity: isNew ? 1 : 0.6 }}
            />
          </Field>

          <Field label="Model" hint="e.g. claude-opus-4-5, claude-sonnet-4-5">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4-5 (leave blank to inherit)"
              style={m.input}
            />
          </Field>

          <Field label="Allow Rules" hint="One tool/pattern per line. Empty = allow all.">
            <textarea
              value={allow}
              onChange={(e) => setAllow(e.target.value)}
              rows={5}
              placeholder="Bash&#10;Read&#10;Write"
              style={m.textarea}
            />
          </Field>

          <Field label="Deny Rules" hint="One tool/pattern per line. Deny takes precedence over allow.">
            <textarea
              value={deny}
              onChange={(e) => setDeny(e.target.value)}
              rows={5}
              placeholder="WebSearch&#10;computer"
              style={m.textarea}
            />
          </Field>

          {error && <div style={m.error}>{error}</div>}
        </div>

        <div style={m.footer}>
          <button onClick={onClose} style={m.cancelBtn} disabled={saving}>Cancel</button>
          <button onClick={handleSave} style={m.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={m.fieldLabel}>{label}</label>
      {hint && <span style={m.fieldHint}>{hint}</span>}
      {children}
    </div>
  )
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ employeeId, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/api/policy/${encodeURIComponent(employeeId)}`)
      onDeleted()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={m.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...m.modal, maxWidth: '400px' }}>
        <div style={m.modalHeader}>
          <h2 style={m.modalTitle}>Delete Policy</h2>
          <button onClick={onClose} style={m.closeBtn}>✕</button>
        </div>
        <div style={m.body}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Delete the policy for <strong style={{ color: 'var(--text-primary)' }}>{employeeId}</strong>?
            This cannot be undone.
          </p>
          {error && <div style={m.error}>{error}</div>}
        </div>
        <div style={m.footer}>
          <button onClick={onClose} style={m.cancelBtn} disabled={deleting}>Cancel</button>
          <button onClick={handleDelete} style={m.deleteBtn} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Policy Card ──────────────────────────────────────────────────────────────

function PolicyCard({ policy, onEdit, onDelete }) {
  const isDefault = policy.employee_id === 'default'

  return (
    <div style={{ ...s.card, ...(isDefault ? s.cardDefault : {}) }}>
      <div style={s.cardHead}>
        <div>
          <div style={s.cardId}>
            {isDefault ? (
              <span style={s.defaultBadge}>default</span>
            ) : (
              policy.employee_id
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '3px' }}>
            {policy.updated_at && (
              <div style={s.cardMeta}>
                Updated {new Date(policy.updated_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            )}
            <div style={s.cardMeta}>
              <span style={{ color: 'var(--text-muted)', marginRight: '3px' }}>Last fetched:</span>
              <span style={{ color: policy.last_fetched_at ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {fmtAgo(policy.last_fetched_at)}
              </span>
            </div>
          </div>
        </div>
        <div style={s.cardActions}>
          <button onClick={() => onEdit(policy)} style={s.editBtn}>Edit</button>
          <button onClick={() => onDelete(policy.employee_id)} style={s.delBtn}>Delete</button>
        </div>
      </div>

      <div style={s.ruleRow}>
        <RuleGroup
          label="Allow"
          items={policy.allow || []}
          color="var(--green)"
          bg="var(--green-bg)"
          empty="All tools"
        />
        <RuleGroup
          label="Deny"
          items={policy.deny || []}
          color="var(--red)"
          bg="var(--red-bg)"
          empty="None"
        />
        <div style={s.ruleGroup}>
          <span style={s.ruleLabel}>Model</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {policy.model || <span style={{ color: 'var(--text-muted)' }}>inherit</span>}
          </span>
        </div>
      </div>
    </div>
  )
}

function RuleGroup({ label, items, color, bg, empty }) {
  return (
    <div style={s.ruleGroup}>
      <span style={s.ruleLabel}>{label}</span>
      {items.length === 0 ? (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{empty}</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {items.map((item, i) => (
            <span key={i} style={{ ...s.ruleChip, background: bg, color }}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PolicyEditor() {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/policy')
      setPolicies(res?.policies || (Array.isArray(res) ? res : []))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleEdit(policy) {
    setEditTarget(policy)
  }

  function handleAdd() {
    setEditTarget({ employee_id: '', allow: [], deny: [], mcpServers: {}, enabledPlugins: {}, model: '' })
  }

  if (loading) return <LoadingSpinner center />

  if (error) {
    return (
      <div style={{ padding: '40px', color: 'var(--red)' }}>
        <strong>Error:</strong> {error}
      </div>
    )
  }

  // Sort: default first, then alphabetically
  const sorted = [...policies].sort((a, b) => {
    if (a.employee_id === 'default') return -1
    if (b.employee_id === 'default') return 1
    return (a.employee_id || '').localeCompare(b.employee_id || '')
  })

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Policy Editor</h1>
          <p style={s.pageSubtitle}>{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
        </div>
        <button onClick={handleAdd} style={s.addBtn}>+ Add Policy</button>
      </div>

      {sorted.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>⛨</div>
          <div style={s.emptyTitle}>No policies defined</div>
          <p style={s.emptyText}>
            Add a "default" policy to set baseline allow/deny rules for all employees,
            then override per-employee as needed.
          </p>
          <button onClick={handleAdd} style={s.addBtn}>Add your first policy</button>
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map((p) => (
            <PolicyCard
              key={p.employee_id}
              policy={p}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteTarget(id)}
            />
          ))}
        </div>
      )}

      {editTarget !== null && (
        <PolicyModal
          policy={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}

      {deleteTarget !== null && (
        <DeleteConfirm
          employeeId={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={load}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    padding: '28px 32px',
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: '4px 0 0',
  },
  addBtn: {
    padding: '8px 16px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '18px 22px',
  },
  cardDefault: {
    borderColor: 'var(--accent)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  cardId: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '-0.1px',
  },
  cardMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '3px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
  },
  defaultBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    borderRadius: '99px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  editBtn: {
    padding: '5px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  delBtn: {
    padding: '5px 12px',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--red)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  ruleRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
  },
  ruleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '120px',
  },
  ruleLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  ruleChip: {
    display: 'inline-flex',
    padding: '2px 7px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 20px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    textAlign: 'center',
    gap: '12px',
  },
  emptyIcon: {
    fontSize: '40px',
    opacity: 0.3,
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    maxWidth: '400px',
    lineHeight: 1.6,
  },
}

// Modal styles
const m = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    width: '100%',
    maxWidth: '540px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 22px',
    borderBottom: '1px solid var(--border)',
  },
  modalTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '16px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 6px',
  },
  body: {
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    maxHeight: 'calc(80vh - 130px)',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
  },
  fieldHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '-2px',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: '13px',
  },
  textarea: {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.6,
    resize: 'vertical',
  },
  error: {
    padding: '8px 12px',
    background: 'var(--red-bg)',
    border: '1px solid var(--red)',
    borderRadius: 'var(--radius)',
    color: 'var(--red)',
    fontSize: '12px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '14px 22px',
    borderTop: '1px solid var(--border)',
  },
  cancelBtn: {
    padding: '8px 16px',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 20px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 20px',
    background: 'var(--red-bg)',
    border: '1px solid var(--red)',
    borderRadius: 'var(--radius)',
    color: 'var(--red)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
