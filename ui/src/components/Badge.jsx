import React from 'react'

const presets = {
  // Session status
  active:   { bg: 'var(--green-bg)',  color: 'var(--green)',  label: 'active' },
  ended:    { bg: 'var(--grey-bg)',   color: 'var(--grey)',   label: 'ended' },
  stale:    { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b', label: 'stale' },
  // Event types
  SessionStart:      { bg: 'rgba(217,119,6,0.14)', color: 'var(--accent-text)', label: 'SessionStart' },
  Stop:              { bg: 'var(--grey-bg)',     color: 'var(--grey)',    label: 'Stop' },
  PostToolUse:       { bg: 'var(--green-bg)',    color: 'var(--green)',   label: 'PostToolUse' },
  PreToolUse:        { bg: 'var(--yellow-bg)',   color: 'var(--yellow)',  label: 'PreToolUse' },
  PermissionRequest: { bg: 'var(--orange-bg)',   color: 'var(--orange)',  label: 'PermissionRequest' },
  UserPromptSubmit:  { bg: 'var(--purple-bg)',   color: 'var(--purple)',  label: 'UserPromptSubmit' },
  ToolBlocked: { bg: 'var(--red-bg)',    color: 'var(--red)',    label: 'ToolBlocked' },
  // Generic
  critical: { bg: 'var(--red-bg)',    color: 'var(--red)',    label: 'critical' },
  default:  { bg: 'var(--grey-bg)',   color: 'var(--grey)',   label: '' },
}

export default function Badge({ type, label, style: extraStyle }) {
  const preset = presets[type] || presets.default
  const text = label !== undefined ? label : preset.label

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '99px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: preset.bg,
      color: preset.color,
      whiteSpace: 'nowrap',
      ...extraStyle,
    }}>
      {text}
    </span>
  )
}
