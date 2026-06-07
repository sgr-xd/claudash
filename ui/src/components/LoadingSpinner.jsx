import React from 'react'

export default function LoadingSpinner({ size = 24, center = false }) {
  const spinner = (
    <div style={{
      width: size,
      height: size,
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.65s linear infinite',
    }} />
  )

  // Inject keyframes once
  if (typeof document !== 'undefined' && !document.getElementById('spinner-kf')) {
    const style = document.createElement('style')
    style.id = 'spinner-kf'
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
    document.head.appendChild(style)
  }

  if (center) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
      }}>
        {spinner}
      </div>
    )
  }

  return spinner
}
