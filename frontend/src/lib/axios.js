import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// Resolve the API base URL:
// 1. Use the build-time VITE_API_URL if available (set in Railway frontend service vars)
// 2. In production (non-localhost), derive api.* from the current www.* hostname at runtime
// 3. Fall back to relative /api/v1 for local dev (Vite proxy handles it)
function resolveApiBase() {
  if (import.meta.env.VITE_API_URL) return `${import.meta.env.VITE_API_URL}/api/v1`
  const { hostname } = window.location
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const root = hostname.replace(/^www\./, '')
    return `https://api.${root}/api/v1`
  }
  return '/api/v1'
}

const API_BASE = resolveApiBase()

const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // sends httpOnly refresh cookie automatically
})

// ─── Request: inject access token ────────────────────────────────────────────
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response: silent token refresh on 401 ───────────────────────────────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token),
  )
  failedQueue = []
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return http(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true },
        )
        useAuthStore.getState().setAuth(data.user, data.token)
        processQueue(null, data.token)
        original.headers.Authorization = `Bearer ${data.token}`
        return http(original)
      } catch (err) {
        processQueue(err)
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default http
