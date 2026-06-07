const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3365'

/**
 * Parse a UTC timestamp string from the backend.
 * Backend returns ISO strings without timezone info (e.g. "2026-05-27T10:34:19").
 * Appending 'Z' tells JS it's UTC so it converts to local time correctly.
 */
export function parseUTC(ts) {
  if (!ts) return null
  if (ts instanceof Date) return ts                      // already a Date
  if (typeof ts === 'number') return new Date(ts)        // unix ms
  if (typeof ts !== 'string') return new Date(ts)        // fallback
  if (ts.endsWith('Z') || ts.includes('+')) return new Date(ts)
  return new Date(ts + 'Z')                              // naive UTC from backend
}

function getToken() {
  return localStorage.getItem('claudash_token') || ''
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('claudash_token')
    window.location.reload()
    return null
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

// SSE helper — returns an EventSource (caller manages lifecycle)
export function openEventStream(onEvent, onError) {
  const token = getToken()
  // SSE doesn't support custom headers natively; pass token as query param
  const url = `${BASE_URL}/api/events/stream?token=${encodeURIComponent(token)}`
  const es = new EventSource(url)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onEvent(data)
    } catch (_) {
      onEvent(e.data)
    }
  }
  es.onerror = onError || (() => {})
  return es
}
