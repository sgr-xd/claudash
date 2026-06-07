import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  return (
    <div style={s.shell}>
      <Sidebar />
      <main style={s.main}>
        <Outlet />
      </main>
    </div>
  )
}

const s = {
  shell: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--bg-base)',
  },
}
