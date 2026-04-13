import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const apiBase = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1'

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
