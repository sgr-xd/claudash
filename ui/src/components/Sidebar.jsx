import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../App.jsx'

const navItems = [
  { to: '/',          label: 'Overview',   icon: HomeIcon },
  { to: '/audit',     label: 'Audit Log',  icon: ListIcon },
  { to: '/analytics', label: 'Analytics',  icon: ChartIcon },
  { to: '/alerts',    label: 'Alerts',     icon: BellIcon },
  { to: '/policy',    label: 'Policy',     icon: ShieldIcon },
]

/* ── SVG Icons ─────────────────────────────────────────────────────────── */
function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

/* Claude diamond logo mark */
function ClaudeMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <path
        d="M28 4L52 18V38L28 52L4 38V18L28 4Z"
        fill="var(--accent)"
        opacity="0.18"
      />
      <path
        d="M28 10L46 21V35L28 46L10 35V21L28 10Z"
        fill="var(--accent)"
        opacity="0.32"
      />
      <path
        d="M28 18L38 24V32L28 38L18 32V24L28 18Z"
        fill="var(--accent)"
      />
    </svg>
  )
}

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside style={s.sidebar}>
      {/* Brand */}
      <div style={s.brand}>
        <ClaudeMark size={30} />
        <div>
          <div style={s.brandName}>claudash</div>
          <div style={s.brandSub}>Fleet Monitor</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navSection}>WORKSPACE</div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              ...s.navItem,
              ...(isActive ? s.navItemActive : {}),
            })}
          >
            <span style={s.navIcon}><Icon /></span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerInfo}>
          <div style={s.footerDot} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Connected</span>
        </div>
        <button onClick={logout} style={s.logoutBtn}>
          <LogoutIcon />
          Sign out
        </button>
      </div>
    </aside>
  )
}

const s = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100vh',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    padding: '22px 18px 18px',
    borderBottom: '1px solid var(--border)',
  },
  brandName: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '-0.3px',
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  brandSub: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '1px',
  },
  nav: {
    flex: 1,
    padding: '14px 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    overflowY: 'auto',
  },
  navSection: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    padding: '6px 10px 8px',
    textTransform: 'uppercase',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: '13.5px',
    fontWeight: 450,
    textDecoration: 'none',
    transition: 'background 0.1s, color 0.1s',
  },
  navItemActive: {
    background: 'var(--accent-dim)',
    color: 'var(--accent-text)',
  },
  navIcon: {
    opacity: 0.75,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  footer: {
    padding: '12px 14px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  footerDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--green)',
    boxShadow: '0 0 6px var(--green)',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'color 0.1s',
  },
}
