import axios from 'axios'
import { useAuthStore } from '../store/authStore'

function resolveApiBase() {
  if (import.meta.env.VITE_API_URL) return `${import.meta.env.VITE_API_URL}/api/v1`
  const { hostname } = window.location
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const root = hostname.replace(/^www\./, '')
    return `https://api.${root}/api/v1`
  }
  return '/api/v1'
}

const apiBase = resolveApiBase()

let _refreshTimer = null

/**
 * Schedule a proactive silent token refresh 2 minutes before the access token expires.
 * Prevents users from being logged out mid-session due to a 15-minute access token window.
 * Clears any previously pending refresh timer before setting a new one.
 */
export function scheduleTokenRefresh(token) {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  try {
    // Decode JWT payload without verification (we only need the exp claim)
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const delay = payload.exp * 1000 - Date.now() - 2 * 60 * 1000 // 2 min before expiry
    if (delay > 0) {
      _refreshTimer = setTimeout(boot, delay)
    }
  } catch {
    // Malformed token — the reactive 401 interceptor in axios is the fallback
  }
}

/**
 * Cancel any pending proactive refresh timer.
 * Call this on explicit logout so the timer does not fire after the session ends.
 */
export function cancelTokenRefresh() {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
}

/**
 * Called once on app load (from Bootstrap component).
 * Attempts a silent refresh using the httpOnly cookie.
 * Returns the user object on success, null on failure.
 */
export async function boot() {
  try {
    const { data } = await axios.post(
      `${apiBase}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    useAuthStore.getState().setAuth(data.user, data.token)
    scheduleTokenRefresh(data.token)
    return data.user
  } catch {
    useAuthStore.getState().clearAuth()
    return null
  }
}
