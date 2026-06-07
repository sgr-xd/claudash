import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { api, parseUTC, openEventStream } from '../api.js'
import StatCard from '../components/StatCard.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
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
      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload[0].value} events</div>
    </div>
  )
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
      <div style={{ color: 'var(--green)', fontWeight: 600 }}>{payload[0].value} uses</div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtLastSeen(ts) {
  if (!ts) return '—'
  const d = parseUTC(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

function formatHourLabel(hour) {
  if (hour === undefined || hour === null) return ''
  const h = parseInt(hour, 10)
  if (isNaN(h)) return String(hour)
  const period = h >= 12 ? 'pm' : 'am'
  const display = h % 12 || 12
  return `${display}${period}`
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Overview() {
  const [overview, setOverview] = useState(null)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    try {
      const [ov, emps] = await Promise.all([
        api.get('/api/analytics/overview'),
        api.get('/api/employees'),
      ])
      setOverview(ov)
      setEmployees(emps?.employees || [])
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  // SSE: re-fetch immediately when any session opens or closes
  useEffect(() => {
    const es = openEventStream((msg) => {
      const type = msg?.data?.event_type
      if (type === 'SessionStart' || type === 'Stop') {
        load()
      }
    })
    return () => es.close()
  }, [load])

  if (loading) return <LoadingSpinner center />

  if (error) {
    return (
      <div style={{ padding: '40px', color: 'var(--red)' }}>
        <strong>Failed to load:</strong> {error}
      </div>
    )
  }

  const hourlyData = (overview?.events_by_hour || []).map((d) => ({
    ...d,
    label: formatHourLabel(d.hour),
  }))

  const topToolsChart = (overview?.top_tools || []).slice(0, 12).map((t) => ({
    name: t.name,
    count: t.count,
  }))

  const activeMCPs = (overview?.top_mcps || []).length

  return (
    <div style={s.page}>
      {/* ── Page header ── */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Overview</h1>
          <p style={s.pageSubtitle}>
            Claude Code activity across your fleet
            {lastRefresh && (
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                · refreshed {fmtLastSeen(lastRefresh)}
              </span>
            )}
          </p>
        </div>
        <button onClick={load} style={s.refreshBtn}>Refresh</button>
      </div>

      {/* ── Stat cards ── */}
      <div style={s.statsRow}>
        <StatCard
          label="Total Employees"
          value={overview?.total_employees ?? 0}
        />
        <StatCard
          label="Active Sessions"
          value={overview?.active_sessions_now ?? 0}
          accent={overview?.active_sessions_now > 0}
        />
        <StatCard
          label="Events Today"
          value={(overview?.events_today ?? 0).toLocaleString()}
        />
        <StatCard
          label="Active MCPs"
          value={activeMCPs}
          sub={activeMCPs > 0 ? `${activeMCPs} server${activeMCPs !== 1 ? 's' : ''} seen today` : 'none today'}
        />
      </div>

      {/* ── Events by hour chart ── */}
      <div style={s.card}>
        <SectionHeader
          title="Events — Last 24 Hours"
          sub="Tool calls, prompts, and session events"
        />
        {hourlyData.length === 0 ? (
          <EmptyState msg="No event data for the last 24 hours" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Tools + MCPs tables ── */}
      <div style={s.twoCol}>
        <div style={s.card}>
          <SectionHeader title="Top Tools Today" />
          {(overview?.top_tools || []).length === 0 ? (
            <EmptyState msg="No tool data today" />
          ) : (
            <MiniTable
              rows={overview.top_tools.slice(0, 10)}
              nameKey="name"
              countKey="count"
              barColor="var(--accent)"
            />
          )}
        </div>

        <div style={s.card}>
          <SectionHeader title="Top MCP Servers Today" />
          {(overview?.top_mcps || []).length === 0 ? (
            <EmptyState msg="No MCP activity today" />
          ) : (
            <MiniTable
              rows={overview.top_mcps.slice(0, 10)}
              nameKey="name"
              countKey="count"
              barColor="var(--purple)"
            />
          )}
        </div>
      </div>

      {/* ── Employees table ── */}
      <div style={s.card}>
        <SectionHeader title="Employees" sub={`${employees.length} registered`} />
        {employees.length === 0 ? (
          <EmptyState msg="No employees found" />
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Email', 'Last Seen', 'Sessions', 'Active', 'Top Tool'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.email} style={s.tr}>
                    <td style={s.td}>
                      <Link to={`/employees/${encodeURIComponent(emp.email)}`} style={s.empLink}>
                        {emp.email}
                      </Link>
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                      {fmtLastSeen(emp.last_seen)}
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                      {emp.total_sessions ?? 0}
                    </td>
                    <td style={s.td}>
                      {emp.active_sessions > 0 ? (
                        <span style={s.activeDot} title={`${emp.active_sessions} active`}>
                          <span style={s.greenDot} />
                          {emp.active_sessions}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={s.td}>
                      {emp.top_tools?.[0] ? (
                        <span style={s.toolPill}>{emp.top_tools[0].name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
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

// ─── Mini rank table with bar ─────────────────────────────────────────────────

function MiniTable({ rows, nameKey, countKey, barColor }) {
  const max = Math.max(...rows.map((r) => r[countKey]), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{ width: '18px', textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}
          >
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '12px',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: '3px',
            }}>
              {row[nameKey]}
            </div>
            <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
              <div style={{
                height: '100%',
                width: `${(row[countKey] / max) * 100}%`,
                background: barColor,
                borderRadius: '2px',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, minWidth: '32px', textAlign: 'right' }}>
            {row[countKey].toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ msg }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
      {msg}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    padding: '28px 32px',
    maxWidth: '1200px',
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
  refreshBtn: {
    padding: '7px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
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
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  tableWrap: {
    overflowX: 'auto',
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
  tr: {
    transition: 'background 0.1s',
  },
  empLink: {
    color: 'var(--text-primary)',
    fontWeight: 500,
    fontSize: '13px',
  },
  activeDot: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    color: 'var(--green)',
    fontSize: '13px',
    fontWeight: 600,
  },
  greenDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--green)',
    boxShadow: '0 0 4px var(--green)',
    flexShrink: 0,
  },
  toolPill: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
  },
}
