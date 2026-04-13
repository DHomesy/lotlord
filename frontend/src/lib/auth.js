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
    return data.user
  } catch {
    useAuthStore.getState().clearAuth()
    return null
  }
}
