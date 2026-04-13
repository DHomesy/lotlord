import { createBrowserRouter, Navigate } from 'react-router-dom'
import Bootstrap from './Bootstrap'
import ProtectedRoute from './ProtectedRoute'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import AcceptInvitePage from '../pages/auth/AcceptInvitePage'
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
import TermsPage from '../pages/legal/TermsPage'
import PrivacyPage from '../pages/legal/PrivacyPage'
import AdminShell from '../components/layout/AdminShell'
import TenantShell from '../components/layout/TenantShell'
import adminRoutes from './AdminRoutes'
import tenantRoutes from './TenantRoutes'

export const router = createBrowserRouter([
  {
    element: <Bootstrap />,
    children: [
      // Public
      { path: '/login',                element: <LoginPage /> },
      { path: '/register',             element: <RegisterPage /> },
      { path: '/accept-invite/:token', element: <AcceptInvitePage /> },
      { path: '/forgot-password',      element: <ForgotPasswordPage /> },
      { path: '/reset-password',       element: <ResetPasswordPage /> },
      { path: '/terms',                element: <TermsPage /> },
      { path: '/privacy',              element: <PrivacyPage /> },

      // Admin + Landlord
      {
        element: <ProtectedRoute allowedRoles={['admin', 'landlord']} />,
        children: [
          {
            element: <AdminShell />,
            children: adminRoutes,
          },
        ],
      },

      // Tenant
      {
        element: <ProtectedRoute allowedRoles={['tenant']} />,
        children: [
          {
            element: <TenantShell />,
            children: tenantRoutes,
          },
        ],
      },

      // Default redirect
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
])
