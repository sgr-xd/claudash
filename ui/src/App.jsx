import React, { createContext, useContext, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import EmployeeDetail from './pages/EmployeeDetail.jsx'
import SessionDetail from './pages/SessionDetail.jsx'
import AuditLog from './pages/AuditLog.jsx'
import PolicyEditor from './pages/PolicyEditor.jsx'
import Analytics from './pages/Analytics.jsx'
import Alerts from './pages/Alerts.jsx'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3365'

// ─── Auth Context ────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function ClaudeMarkLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
      <path d="M28 4L52 18V38L28 52L4 38V18L28 4Z" fill="#d97706" opacity="0.15"/>
      <path d="M28 10L46 21V35L28 46L10 35V21L28 10Z" fill="#d97706" opacity="0.3"/>
      <path d="M28 18L38 24V32L28 38L18 32V24L28 18Z" fill="#d97706"/>
    </svg>
  )
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const u = username.trim()
    const p = password
    if (!u || !p) { setError('Username and password are required.'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.detail || 'Login failed. Check your credentials.')
        return
      }
      const data = await res.json()
      localStorage.setItem('claudash_token', data.access_token)
      onLogin(data.access_token)
    } catch (err) {
      setError('Could not reach the server. Is claudash running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>
          <ClaudeMarkLarge />
        </div>
        <h1 style={styles.loginTitle}>claudash</h1>
        <p style={styles.loginSub}>Claude Code Fleet Monitor</p>

        <form onSubmit={handleSubmit} style={styles.loginForm}>
          <div>
            <label style={styles.loginLabel}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError('') }}
              placeholder="admin"
              autoFocus
              autoComplete="username"
              style={styles.loginInput}
            />
          </div>
          <div>
            <label style={styles.loginLabel}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="••••••••••••"
              autoComplete="current-password"
              style={styles.loginInput}
            />
          </div>
          {error && <p style={styles.loginError}>{error}</p>}
          <button type="submit" disabled={loading} style={{ ...styles.loginBtn, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={styles.loginFooter}>
          Set <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>CLAUDASH_ADMIN_USER</code> +{' '}
          <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>CLAUDASH_ADMIN_PASS</code> in your <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>.env</code>
        </p>
      </div>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('claudash_token') || '')

  const handleLogin = useCallback((t) => setToken(t), [])
  const handleLogout = useCallback(() => {
    localStorage.removeItem('claudash_token')
    setToken('')
  }, [])

  if (!token) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <AuthContext.Provider value={{ token, logout: handleLogout }}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/employees/:email" element={<EmployeeDetail />} />
            <Route path="/sessions/:sessionId" element={<SessionDetail />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/policy" element={<PolicyEditor />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

// ─── Login Styles ─────────────────────────────────────────────────────────────

const styles = {
  loginWrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-base)',
    padding: '24px',
  },
  loginCard: {
    width: '100%',
    maxWidth: '380px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '44px 40px 36px',
    textAlign: 'center',
  },
  loginLogo: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  loginTitle: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.4px',
    color: 'var(--text-primary)',
    marginBottom: '6px',
  },
  loginSub: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '36px',
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'left',
  },
  loginLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  loginInput: {
    width: '100%',
    padding: '11px 14px',
    fontSize: '14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
  },
  loginError: {
    fontSize: '12px',
    color: 'var(--red)',
    textAlign: 'center',
    margin: 0,
  },
  loginBtn: {
    width: '100%',
    padding: '11px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, opacity 0.15s',
    letterSpacing: '0.01em',
  },
  loginFooter: {
    marginTop: '28px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    textAlign: 'center',
  },
}
