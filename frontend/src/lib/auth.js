import axios from 'axios'
import { useAuthStore } from '../store/authStore'

/**
 * Called once on app load (from Bootstrap component).
 * Attempts a silent refresh using the httpOnly cookie.
 * Returns the user object on success, null on failure.
 */
export async function boot() {
  try {
    const { data } = await axios.post(
      '/api/v1/auth/refresh',
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
