import React, { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../api.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

const DAY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.value.toLocaleString()} {p.name}
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [days, setDays] = useState(7)
  const [employee, setEmployee] = useState('')
  const [employees, setEmployees] = useState([])
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days })
      if (employee) params.set('employee', employee)
      const [trendRes, empRes] = await Promise.all([
        api.get(`/api/analytics/trend?${params}`),
        employees.length === 0 ? api.get('/api/employees') : Promise.resolve(null),
      ])
      setTrend(trendRes)
      if (empRes) setEmployees(empRes?.employees || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [days, employee, employees.length])

  useEffect(() => { load() }, [days, employee])

  if (error) return (
    <div style={{ padding: '40px', color: 'var(--red)' }}>
      <strong>Error:</strong> {error}
    </div>
  )

  const data = trend?.data || []
  const totals = trend?.totals || {}

  // Fill gaps: if a day has no data, show 0
  const filledData = (() => {
    if (!data.length) return []
    // Build a map of date → row
    const map = {}
    for (const d of data) map[d.date] = d
    // Generate all dates in range
    const result = []
    const end = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(end.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      result.push(map[key] || { date: key, sessions: 0, events: 0 })
    }
    return result
  })()

  // Format date labels: "Jun 1"
  const chartData = filledData.map((d) => {
    const dt = new Date(d.date + 'T12:00:00Z')
    return {
      ...d,
      label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }
  })

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Analytics</h1>
          <p style={s.pageSubtitle}>Historical trends from sessions</p>
        </div>
        <button onClick={load} style={s.refreshBtn}>Refresh</button>
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <div style={s.btnGroup}>
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              style={{ ...s.rangeBtn, ...(days === opt.value ? s.rangeBtnActive : {}) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          style={s.select}
        >
          <option value="">All employees</option>
          {employees.map((e) => <option key={e.email} value={e.email}>{e.email}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner center /> : (
        <>
          {/* Summary totals */}
          <div style={s.statsRow}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Sessions ({days}d)</div>
              <div style={s.statValue}>{(totals.sessions || 0).toLocaleString()}</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Events ({days}d)</div>
              <div style={s.statValue}>{(totals.events || 0).toLocaleString()}</div>
            </div>
            {totals.sessions > 0 && (
              <div style={s.statCard}>
                <div style={s.statLabel}>Avg Events / Session</div>
                <div style={s.statValue}>
                  {Math.round(totals.events / totals.sessions).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {chartData.length === 0 ? (
            <div style={s.empty}>No session data for the selected period.</div>
          ) : (
            <>
              {/* Events area chart */}
              <div style={s.card}>
                <h2 style={s.cardTitle}>Events per Day</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="evtGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)' }} />
                    <Area type="monotone" dataKey="events" name="events" stroke="var(--accent)" fill="url(#evtGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Sessions bar chart */}
              <div style={s.card}>
                <h2 style={s.cardTitle}>Sessions per Day</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="sessions" name="sessions" fill="var(--purple)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const s = {
  page: { padding: '28px 32px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  pageTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' },
  pageSubtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' },
  refreshBtn: { padding: '7px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  controls: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  btnGroup: { display: 'flex', gap: '4px' },
  rangeBtn: { padding: '6px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  rangeBtnActive: { background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)' },
  select: { padding: '7px 12px', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', cursor: 'pointer' },
  statsRow: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  statCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', flex: 1, minWidth: '140px' },
  statLabel: { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' },
  statValue: { fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' },
  cardTitle: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '-0.1px' },
  empty: { padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' },
}
