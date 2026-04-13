import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { boot } from '../lib/auth'
import { useAuthStore } from '../store/authStore'
import LoadingOverlay from '../components/common/LoadingOverlay'

/**
 * Runs once on app mount. Calls POST /auth/refresh via httpOnly cookie
 * to silently restore the session. Renders a loading screen while in
 * progress. All protected routes sit inside this component.
 */
export default function Bootstrap() {
  const { isLoading, setLoading } = useAuthStore()

  useEffect(() => {
    setLoading(true)
    boot().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) return <LoadingOverlay message="Starting up…" />

  return <Outlet />
}
