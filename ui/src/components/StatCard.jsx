import React from 'react'

export default function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...s.card, ...(accent ? s.cardAccent : {}) }}>
      <div style={s.label}>{label}</div>
      <div style={{ ...s.value, ...(accent ? s.valueAccent : {}) }}>
        {value ?? <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>—</span>}
      </div>
      {sub && <div style={s.sub}>{sub}</div>}
    </div>
  )
}

const s = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    minWidth: 0,
  },
  cardAccent: {
    borderColor: 'rgba(217,119,6,0.45)',
    background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(217,119,6,0.06) 100%)',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
    lineHeight: 1.1,
  },
  valueAccent: {
    color: 'var(--accent)',
  },
  sub: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
}
