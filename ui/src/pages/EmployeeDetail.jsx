import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { api, parseUTC } from '../api.js'
import StatCard from '../components/StatCard.jsx'
import Badge from '../components/Badge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

function fmtDate(ts) {
  if (!ts) return '—'
  return parseUTC(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtLastSeen(ts) {
  if (!ts) return '—'
  const diff = Date.now() - parseUTC(ts).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return parseUTC(ts).toLocaleDateString()
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
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function ToolTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '8px 12px',
      fontSize: '12px',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>{label}</div>
      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload[0].value} uses</div>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/" style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      ← Employees
    </Link>
  )
}

export default function EmployeeDetail() {
  const { email } = useParams()
  const decoded = decodeURIComponent(email)
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/employees/${encodeURIComponent(decoded)}`)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [decoded])

  useEffect(() => { load() }, [load])

  async function handleDelete(cascade) {
    if (!window.confirm(
      cascade
        ? `Delete ${decoded} and ALL their sessions & events? This cannot be undone.`
        : `Remove ${decoded} from the employee list? Their sessions and events will be preserved.`
    )) return
    setDeleting(true)
    try {
      await api.delete(`/api/employees/${encodeURIComponent(decoded)}${cascade ? '?cascade=true' : ''}`)
      navigate('/')
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner center />

  if (error) {
    return (
      <div style={{ padding: '40px' }}>
        <BackLink />
        <div style={{ marginTop: '20px', color: 'var(--red)' }}>
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  const toolsChartData = (data?.top_tools || []).slice(0, 15).map((t) => ({
    name: t.name,
    count: t.count,
  }))

  const sessions = data?.recent_sessions || []

  return (
    <div style={s.page}>
      <BackLink />

      {/* Employee header */}
      <div style={s.header}>
        <div style={s.avatar}>{decoded[0]?.toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h1 style={s.email}>{decoded}</h1>
          <div style={s.meta}>
            {data?.device_id && (
              <span style={s.metaItem}>
                <span style={{ color: 'var(--text-muted)' }}>Device:</span>{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{data.device_id}</span>
              </span>
            )}
            <span style={s.metaItem}>
              <span style={{ color: 'var(--text-muted)' }}>Last seen:</span>{' '}
              {fmtLastSeen(data?.last_seen)}
            </span>
          </div>
        </div>
        {/* Delete actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => handleDelete(false)}
            disabled={deleting}
            title="Remove employee record (keeps sessions & events)"
            style={{ ...sBtn.base, ...sBtn.ghost }}
          >
            Remove
          </button>
          <button
            onClick={() => handleDelete(true)}
            disabled={deleting}
            title="Delete employee AND all their sessions & events"
            style={{ ...sBtn.base, ...sBtn.danger }}
          >
            {deleting ? 'Deleting…' : 'Delete all data'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard label="Total Sessions" value={data?.total_sessions ?? 0} />
        <StatCard
          label="Active Sessions"
          value={data?.active_sessions ?? 0}
          accent={(data?.active_sessions ?? 0) > 0}
        />
        <StatCard label="Top Tools Tracked" value={(data?.top_tools || []).length} />
      </div>

      {/* Tool usage chart */}
      {toolsChartData.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Tool Usage</h2>
          <ResponsiveContainer width="100%" height={Math.max(toolsChartData.length * 32, 120)}>
            <BarChart
              layout="vertical"
              data={toolsChartData}
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                width={140}
              />
              <Tooltip content={<ToolTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent sessions table */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Recent Sessions</h2>
        {sessions.length === 0 ? (
          <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
            No sessions found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Working Dir', 'Started', 'Duration', 'Events', 'Status', 'Model'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => (
                  <tr key={sess.session_id} style={s.tr}>
                    <td style={s.td}>
                      <Link
                        to={`/sessions/${encodeURIComponent(sess.session_id)}`}
                        style={s.cwdLink}
                        title={sess.cwd}
                      >
                        {shortCwd(sess.cwd)}
                      </Link>
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(sess.started_at)}
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                      {duration(sess.started_at, sess.ended_at)}
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                      {sess.event_count ?? 0}
                    </td>
                    <td style={s.td}>
                      <Badge type={sess.status === 'active' ? 'active' : 'ended'} />
                    </td>
                    <td style={{ ...s.td }}>
                      {sess.model ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {sess.model}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '4px',
  },
  avatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--accent)',
    flexShrink: 0,
  },
  email: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  meta: {
    display: 'flex',
    gap: '16px',
    marginTop: '4px',
    flexWrap: 'wrap',
  },
  metaItem: {
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '16px',
    letterSpacing: '-0.1px',
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
    padding: '11px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  },
  tr: {},
  cwdLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    color: 'var(--accent)',
  },
}

const sBtn = {
  base: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    transition: 'opacity 0.15s',
  },
  ghost: {
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
  },
  danger: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.35)',
    color: '#ef4444',
  },
}
