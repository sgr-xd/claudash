import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, openEventStream, parseUTC } from '../api.js'
import Badge from '../components/Badge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

const PAGE_SIZE = 100

const EVENT_TYPES = [
  'SessionStart', 'Stop', 'PostToolUse', 'PreToolUse',
  'PermissionRequest', 'UserPromptSubmit',
]

function fmtDateTime(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function shortCwd(cwd) {
  if (!cwd) return '—'
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function prettyJSON(val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val
  try { return JSON.stringify(val, null, 2) } catch { return String(val) }
}

function ModelPill({ model }) {
  if (!model) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={s.modelPill}>{model.replace(/^claude-/, '')}</span>
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function AuditRow({ event, navigate, highlight }) {
  const [expanded, setExpanded] = useState(false)
  const hasInput = event.tool_input !== null && event.tool_input !== undefined
  const hasPrompt = !!event.prompt_text

  return (
    <>
      <tr
        style={{
          ...s.tr,
          cursor: hasInput || hasPrompt ? 'pointer' : 'default',
          ...(highlight ? { animation: 'fadeIn 0.4s ease' } : {}),
        }}
        onClick={() => (hasInput || hasPrompt) && setExpanded((e) => !e)}
      >
        <td style={{ ...s.td, ...s.tdMono, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
          {fmtDateTime(event.timestamp)}
        </td>
        <td style={s.td}>
          {event.employee ? (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/employees/${encodeURIComponent(event.employee)}`) }}
              style={s.empBtn}
            >
              {event.employee}
            </button>
          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </td>
        <td style={s.td}>
          <Badge type={event.event_type} label={event.event_type} />
        </td>
        <td style={{ ...s.td, ...s.tdMono }}>
          {event.tool_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </td>
        <td style={{ ...s.td, ...s.tdMono, color: 'var(--text-muted)' }}>
          {shortCwd(event.cwd)}
        </td>
        <td style={s.td}>
          <ModelPill model={event.model} />
        </td>
        <td style={{ ...s.td, textAlign: 'right', width: '20px' }}>
          {(hasInput || hasPrompt) && (
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={s.expandedCell}>
            {hasPrompt && (
              <div style={{ marginBottom: hasInput ? '8px' : 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Prompt</div>
                <pre style={{ ...s.jsonPre, borderColor: 'var(--purple)', color: 'var(--text-secondary)' }}>{event.prompt_text}</pre>
              </div>
            )}
            {hasInput ? (
              <pre style={s.jsonPre}>{prettyJSON(event.tool_input)}</pre>
            ) : !hasPrompt ? (
              <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                No tool input for this event.
              </div>
            ) : null}
            {event.session_id && (
              <div style={{ marginTop: '6px' }}>
                <Link
                  to={`/sessions/${encodeURIComponent(event.session_id)}`}
                  style={{ fontSize: '11px', color: 'var(--accent)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View session →
                </Link>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const navigate = useNavigate()
  const [data, setData] = useState({ events: [], total: 0, pages: 1 })
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [liveCount, setLiveCount] = useState(0)   // new events from SSE not yet shown
  const esRef = useRef(null)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterTool, setFilterTool] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // Build current filter params
  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (filterEmployee) p.set('employee', filterEmployee)
    if (filterType) p.set('event_type', filterType)
    if (filterTool) p.set('tool_name', filterTool)
    if (filterDateFrom) p.set('date_from', filterDateFrom)
    if (filterDateTo) p.set('date_to', filterDateTo)
    if (search) p.set('search', search)
    return p
  }, [filterEmployee, filterType, filterTool, filterDateFrom, filterDateTo, search])

  const load = useCallback(async (pg = page) => {
    try {
      const params = new URLSearchParams(filterParams)
      params.set('page', pg)
      params.set('limit', PAGE_SIZE)

      const [evtRes, empRes] = await Promise.all([
        api.get(`/api/events?${params}`),
        employees.length === 0 ? api.get('/api/employees') : Promise.resolve(null),
      ])
      setData(evtRes)
      if (empRes) setEmployees(empRes?.employees || [])
      setError(null)
      setLiveCount(0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterParams, page, employees.length])

  useEffect(() => { load(0); setPage(0) }, [filterEmployee, filterType, filterTool, filterDateFrom, filterDateTo, search])
  useEffect(() => { load(page) }, [page])

  // SSE: increment counter when new events arrive on page 0 with no filters
  useEffect(() => {
    const es = openEventStream((msg) => {
      if (msg.type === 'event') {
        // Only auto-show on page 0 with no active filters
        const hasFilters = filterEmployee || filterType || filterTool || filterDateFrom || filterDateTo || search
        if (page === 0 && !hasFilters) {
          // Prepend to events list immediately
          setData((prev) => {
            const newEvt = msg.data
            const already = prev.events.some(
              (e) => e.session_id === newEvt.session_id && e.timestamp === newEvt.timestamp && e.event_type === newEvt.event_type
            )
            if (already) return prev
            return {
              ...prev,
              events: [newEvt, ...prev.events].slice(0, PAGE_SIZE),
              total: prev.total + 1,
            }
          })
        } else {
          // Show "new events" pill
          setLiveCount((c) => c + 1)
        }
      }
    })
    esRef.current = es
    return () => es.close()
  }, [filterEmployee, filterType, filterTool, filterDateFrom, filterDateTo, search, page])

  const empOptions = useMemo(() => (
    [...new Set(employees.map((e) => e.email).filter(Boolean))].sort()
  ), [employees])

  const hasFilters = filterEmployee || filterType || filterTool || filterDateFrom || filterDateTo || search
  const [exportOpen, setExportOpen] = useState(false)

  // Export URL builder
  function buildExportUrl(format) {
    const params = new URLSearchParams(filterParams)
    params.set('format', format)
    params.set('limit', '10000')
    const token = localStorage.getItem('claudash_token') || ''
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3365'
    return `${base}/api/events/export?${params}&token=${encodeURIComponent(token)}`
  }

  if (loading) return <LoadingSpinner center />
  if (error) return (
    <div style={{ padding: '40px', color: 'var(--red)' }}>
      <strong>Error:</strong> {error}
    </div>
  )

  const events = data.events || []
  const total = data.total || 0
  const totalPages = data.pages || 1

  return (
    <div style={s.page}>
      {/* Fade-in keyframes */}
      <style>{`@keyframes fadeIn { from { background: var(--accent-dim) } to { background: transparent } }`}</style>

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Audit Log</h1>
          <p style={s.pageSubtitle}>
            {total.toLocaleString()} event{total !== 1 ? 's' : ''} matching filters
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {liveCount > 0 && (
            <button
              onClick={() => { load(0); setPage(0) }}
              style={s.liveBtn}
            >
              ↑ {liveCount} new event{liveCount !== 1 ? 's' : ''}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button style={s.refreshBtn} onClick={() => setExportOpen((o) => !o)}>
              Export ▾
            </button>
            {exportOpen && (
              <div style={s.exportMenu} onMouseLeave={() => setExportOpen(false)}>
                <a href={buildExportUrl('json')} download onClick={() => setExportOpen(false)} style={s.exportItem}>↓ Download JSON</a>
                <a href={buildExportUrl('csv')} download onClick={() => setExportOpen(false)} style={s.exportItem}>↓ Download CSV</a>
              </div>
            )}
          </div>
          <button onClick={() => load(page)} style={s.refreshBtn}>Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tool, employee, dir…"
          style={s.searchInput}
        />
        <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} style={s.select}>
          <option value="">All employees</option>
          {empOptions.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={s.select}>
          <option value="">All event types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={filterTool}
          onChange={(e) => setFilterTool(e.target.value)}
          placeholder="Tool name…"
          style={{ ...s.searchInput, maxWidth: '140px' }}
        />
        <div style={s.dateRange}>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={s.dateInput} title="From" />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={s.dateInput} title="To" />
        </div>
        {hasFilters && (
          <button onClick={() => { setFilterEmployee(''); setFilterType(''); setFilterTool(''); setFilterDateFrom(''); setFilterDateTo(''); setSearch('') }} style={s.clearBtn}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={s.card}>
        {events.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No events match the current filters.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Timestamp</th>
                    <th style={s.th}>Employee</th>
                    <th style={s.th}>Event Type</th>
                    <th style={s.th}>Tool</th>
                    <th style={s.th}>Working Dir</th>
                    <th style={s.th}>Model</th>
                    <th style={{ ...s.th, width: '20px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt, i) => (
                    <AuditRow key={`${evt.session_id}-${evt.timestamp}-${i}`} event={evt} navigate={navigate} highlight={i === 0 && liveCount === 0} />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={s.pagination}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={{ ...s.pageBtn, opacity: page === 0 ? 0.4 : 1 }}>
                  ← Prev
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Page {page + 1} of {totalPages}
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>({total.toLocaleString()} total)</span>
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...s.pageBtn, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const s = {
  page: { padding: '28px 32px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  pageTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' },
  pageSubtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' },
  refreshBtn: { padding: '7px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  liveBtn: { padding: '6px 12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', animation: 'pulse 1.5s ease infinite' },
  filters: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { padding: '8px 12px', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', minWidth: '200px', outline: 'none' },
  select: { padding: '8px 12px', fontSize: '13px', minWidth: '160px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', cursor: 'pointer' },
  dateRange: { display: 'flex', alignItems: 'center', gap: '8px' },
  dateInput: { padding: '7px 10px', fontSize: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', colorScheme: 'dark' },
  clearBtn: { padding: '7px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tdMono: { fontFamily: 'var(--font-mono)', fontSize: '11px' },
  tr: {},
  empBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: 'var(--font)' },
  modelPill: { display: 'inline-block', padding: '2px 7px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  expandedCell: { padding: '4px 14px 12px 44px', background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' },
  jsonPre: { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', overflowX: 'auto', lineHeight: 1.6, margin: '6px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '280px', overflowY: 'auto' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid var(--border)' },
  pageBtn: { padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  exportMenu: {
    position: 'absolute', top: '100%', right: 0, marginTop: '4px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', minWidth: '160px', zIndex: 100,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  exportItem: {
    display: 'block', padding: '9px 14px', fontSize: '13px',
    color: 'var(--text-primary)', textDecoration: 'none',
    cursor: 'pointer',
  },
}
