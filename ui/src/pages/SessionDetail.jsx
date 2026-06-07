import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, parseUTC } from '../api.js'
import Badge from '../components/Badge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

const RETENTION_DAYS = Number(import.meta.env.VITE_RETENTION_DAYS || 30)

function fmtDateTime(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtTime(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function duration(start, end) {
  if (!start) return '—'
  const ms = (end ? parseUTC(end) : new Date()) - parseUTC(start)
  if (ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function prettyJSON(val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

function truncateInput(val, max = 120) {
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val || '')
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

function matchesSearch(event, q) {
  if (!q) return true
  const lower = q.toLowerCase()
  const fields = [
    event.tool_name,
    event.event_type,
    event.cwd,
    typeof event.tool_input === 'object'
      ? JSON.stringify(event.tool_input)
      : String(event.tool_input || ''),
    event.prompt_text,
  ]
  return fields.some((f) => f && f.toLowerCase().includes(lower))
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event }) {
  const [expanded, setExpanded] = useState(false)
  const hasInput = event.tool_input !== null && event.tool_input !== undefined
  const hasPrompt = !!event.prompt_text

  return (
    <>
      <tr
        style={{ ...s.tr, cursor: hasInput || hasPrompt ? 'pointer' : 'default' }}
        onClick={() => (hasInput || hasPrompt) && setExpanded((e) => !e)}
      >
        <td style={{ ...s.td, ...s.tdMono, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
          {fmtTime(event.timestamp)}
        </td>
        <td style={s.td}>
          <Badge type={event.event_type} label={event.event_type} />
        </td>
        <td style={{ ...s.td, ...s.tdMono }}>
          {event.tool_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </td>
        <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
          {hasInput ? (
            <span style={s.inputPreview}>{truncateInput(event.tool_input)}</span>
          ) : hasPrompt ? (
            <span style={{ ...s.inputPreview, color: 'var(--purple)', fontStyle: 'italic' }}>
              {truncateInput(event.prompt_text)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </td>
        <td style={{ ...s.td, textAlign: 'right' }}>
          {(hasInput || hasPrompt) && (
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </td>
      </tr>
      {expanded && (hasInput || hasPrompt) && (
        <tr>
          <td colSpan={5} style={s.expandedCell}>
            {hasPrompt && (
              <div style={{ marginBottom: hasInput ? '8px' : 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Prompt</div>
                <pre style={{ ...s.jsonPre, borderColor: 'var(--purple)' }}>{event.prompt_text}</pre>
              </div>
            )}
            {hasInput && <pre style={s.jsonPre}>{prettyJSON(event.tool_input)}</pre>}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SessionDetail() {
  const { sessionId } = useParams()
  const decoded = decodeURIComponent(sessionId)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/sessions/${encodeURIComponent(decoded)}`)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [decoded])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner center />

  if (error) {
    return (
      <div style={{ padding: '40px' }}>
        <Link to="/audit" style={s.backLink}>← Sessions</Link>
        <div style={{ marginTop: '20px', color: 'var(--red)' }}>
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  const sess = data?.session || {}
  const events = data?.events || []

  // Expiry warning: session started more than RETENTION_DAYS ago
  const sessionAge = sess.started_at
    ? (Date.now() - parseUTC(sess.started_at).getTime()) / 86_400_000
    : 0
  const showExpiryWarning = sessionAge > RETENTION_DAYS * 0.9  // warn at 90% of retention period

  const eventTypes = [...new Set(events.map((e) => e.event_type).filter(Boolean))]

  const filtered = useMemo(() => {
    let list = events
    if (eventTypeFilter) list = list.filter((e) => e.event_type === eventTypeFilter)
    if (search) list = list.filter((e) => matchesSearch(e, search))
    return list
  }, [events, eventTypeFilter, search])

  return (
    <div style={s.page}>
      <Link to="/audit" style={s.backLink}>← Sessions</Link>

      {/* Expiry warning */}
      {showExpiryWarning && (
        <div style={s.expiryBanner}>
          <span style={{ fontSize: '15px' }}>⚠</span>
          <span>
            {events.length === 0
              ? `Events for this session have expired — retention is ${RETENTION_DAYS} days and this session is ${Math.floor(sessionAge)} days old.`
              : `This session is ${Math.floor(sessionAge)} days old. Events may be partially expired (retention: ${RETENTION_DAYS} days).`}
          </span>
        </div>
      )}

      {/* Session info header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.sessionId}>
            Session
            <span style={s.sessionIdVal}>{decoded.slice(0, 16)}…</span>
          </div>
          {sess.employee && (
            <Link
              to={`/employees/${encodeURIComponent(sess.employee)}`}
              style={s.empLink}
            >
              {sess.employee}
            </Link>
          )}
        </div>
        <Badge type={sess.status === 'active' ? 'active' : sess.status === 'stale' ? 'stale' : 'ended'} style={{ fontSize: '12px', padding: '3px 10px' }} />
      </div>

      {/* Info cards */}
      <div style={s.infoGrid}>
        <InfoItem label="Working Dir" value={sess.cwd} mono />
        <InfoItem label="Model" value={sess.model} mono />
        <InfoItem label="Started" value={fmtDateTime(sess.started_at)} />
        <InfoItem label="Ended" value={sess.ended_at ? fmtDateTime(sess.ended_at) : sess.status === 'active' ? 'In progress' : '—'} />
        <InfoItem label="Duration" value={duration(sess.started_at, sess.ended_at)} />
        <InfoItem label="Events" value={sess.event_count ?? events.length} />
      </div>

      {/* Events */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <h2 style={s.cardTitle}>Events ({filtered.length}{filtered.length !== events.length ? ` of ${events.length}` : ''})</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              style={s.searchInput}
            />
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={s.filterSelect}
            >
              <option value="">All types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
            {events.length === 0 ? 'No events' : 'No events match the search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Time</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Tool</th>
                  <th style={s.th}>Input Preview</th>
                  <th style={{ ...s.th, width: '24px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt, i) => (
                  <EventRow key={i} event={evt} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoItem({ label, value, mono }) {
  return (
    <div style={s.infoItem}>
      <div style={s.infoLabel}>{label}</div>
      <div style={{ ...s.infoValue, ...(mono ? { fontFamily: 'var(--font-mono)', fontSize: '11px' } : {}) }}>
        {value || '—'}
      </div>
    </div>
  )
}

const s = {
  page: {
    padding: '28px 32px',
    maxWidth: '1100px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  backLink: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  expiryBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    color: '#f59e0b',
    lineHeight: 1.5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginTop: '4px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sessionId: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  sessionIdVal: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
  },
  empLink: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  },
  infoItem: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 14px',
  },
  infoLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  searchInput: {
    padding: '6px 10px',
    fontSize: '12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: '160px',
  },
  filterSelect: {
    padding: '6px 10px',
    fontSize: '12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  },
  tdMono: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  },
  tr: {
    transition: 'background 0.1s',
  },
  inputPreview: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    maxWidth: '400px',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  expandedCell: {
    padding: '0 12px 12px 44px',
    background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border)',
  },
  jsonPre: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 14px',
    overflowX: 'auto',
    lineHeight: 1.6,
    margin: '8px 0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '400px',
    overflowY: 'auto',
  },
}
