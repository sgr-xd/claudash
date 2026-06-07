import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api, parseUTC } from '../api.js'
import Badge from '../components/Badge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

const PAGE_SIZE = 50

const STATUS_OPTIONS = ['active', 'ended', 'stale']

function fmtDateTime(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function duration(start, end) {
  if (!start) return '—'
  const ms = (end ? parseUTC(end) : new Date()) - parseUTC(start)
  if (ms < 0) return '—'
  const m = Math.floor(ms / 60_000)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function shortCwd(cwd) {
  if (!cwd) return '—'
  return cwd.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
}

export default function Sessions() {
  const [data, setData] = useState({ sessions: [], total: 0, pages: 1 })
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [page, setPage] = useState(0)

  const load = useCallback(async (pg = 0) => {
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE })
      if (filterEmployee) params.set('employee', filterEmployee)
      if (filterStatus) params.set('status', filterStatus)
      if (filterDateFrom) params.set('date_from', filterDateFrom)
      if (filterDateTo) params.set('date_to', filterDateTo)

      const [res, empRes] = await Promise.all([
        api.get(`/api/sessions?${params}`),
        employees.length === 0 ? api.get('/api/employees') : Promise.resolve(null),
      ])
      setData(res)
      if (empRes) setEmployees(empRes?.employees || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterEmployee, filterStatus, filterDateFrom, filterDateTo, employees.length])

  useEffect(() => { setPage(0); load(0) }, [filterEmployee, filterStatus, filterDateFrom, filterDateTo])
  useEffect(() => { load(page) }, [page])

  const empOptions = useMemo(() => (
    [...new Set(employees.map((e) => e.email).filter(Boolean))].sort()
  ), [employees])

  const hasFilters = filterEmployee || filterStatus || filterDateFrom || filterDateTo

  if (loading) return <LoadingSpinner center />
  if (error) return <div style={{ padding: '40px', color: 'var(--red)' }}><strong>Error:</strong> {error}</div>

  const sessions = data.sessions || []
  const total = data.total || 0
  const totalPages = data.pages || 1

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Sessions</h1>
          <p style={s.pageSubtitle}>{total.toLocaleString()} session{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => load(page)} style={s.refreshBtn}>Refresh</button>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} style={s.select}>
          <option value="">All employees</option>
          {empOptions.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={s.select}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <div style={s.dateRange}>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={s.dateInput} title="From" />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={s.dateInput} title="To" />
        </div>
        {hasFilters && (
          <button onClick={() => { setFilterEmployee(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('') }} style={s.clearBtn}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={s.card}>
        {sessions.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No sessions found.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Employee', 'Working Dir', 'Started', 'Duration', 'Events', 'Model', 'Status'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((sess) => (
                    <tr key={sess.session_id} style={s.tr}>
                      <td style={s.td}>
                        {sess.employee ? (
                          <Link to={`/employees/${encodeURIComponent(sess.employee)}`} style={s.empLink}>
                            {sess.employee}
                          </Link>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ ...s.td, ...s.tdMono }}>
                        <Link to={`/sessions/${encodeURIComponent(sess.session_id)}`} style={s.cwdLink}>
                          {shortCwd(sess.cwd)}
                        </Link>
                      </td>
                      <td style={{ ...s.td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(sess.started_at)}
                      </td>
                      <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                        {duration(sess.started_at, sess.ended_at)}
                      </td>
                      <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                        {sess.event_count ?? 0}
                      </td>
                      <td style={{ ...s.td, ...s.tdMono, color: 'var(--text-muted)' }}>
                        {sess.model ? sess.model.replace(/^claude-/, '') : '—'}
                      </td>
                      <td style={s.td}>
                        <Badge type={sess.status} label={sess.status} />
                      </td>
                    </tr>
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
                  Page {page + 1} of {totalPages} <span style={{ color: 'var(--text-muted)' }}>({total.toLocaleString()} total)</span>
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
  filters: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
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
  empLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: '13px' },
  cwdLink: { color: 'var(--text-secondary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid var(--border)' },
  pageBtn: { padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' },
}
