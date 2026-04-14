import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Guards a group of routes by role.
 * Unauthenticated users → /login
 * Wrong role → redirect to their home
 * Landlords with unverified email → /verify-email-pending
 */
export default function ProtectedRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const home = user.role === 'tenant' ? '/my/dashboard' : '/dashboard'
    return <Navigate to={home} replace />
  }

  // Block unverified landlords — admins and tenants are exempt
  if (user.role === 'landlord' && !user.email_verified_at) {
    return <Navigate to="/verify-email-pending" replace />
  }

  return <Outlet />
}
