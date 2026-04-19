import { createBrowserRouter, Navigate } from 'react-router-dom'
import Bootstrap from './Bootstrap'
import ProtectedRoute from './ProtectedRoute'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import AcceptInvitePage from '../pages/auth/AcceptInvitePage'
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
import VerifyEmailPage from '../pages/auth/VerifyEmailPage'
import VerifyEmailPendingPage from '../pages/auth/VerifyEmailPendingPage'
import TermsPage from '../pages/legal/TermsPage'
import PrivacyPage from '../pages/legal/PrivacyPage'
import LandingPage from '../pages/LandingPage'
import AdminShell from '../components/layout/AdminShell'
import TenantShell from '../components/layout/TenantShell'
import adminRoutes from './AdminRoutes'
import tenantRoutes from './TenantRoutes'

export const router = createBrowserRouter([
  // Marketing landing page — no auth required, redirects to /dashboard if logged in
  { path: '/', element: <LandingPage /> },

  {
    element: <Bootstrap />,
    children: [
      // Public
      { path: '/login',                    element: <LoginPage /> },
      { path: '/register',                 element: <RegisterPage /> },
      { path: '/accept-invite/:token',     element: <AcceptInvitePage /> },
      { path: '/forgot-password',          element: <ForgotPasswordPage /> },
      { path: '/reset-password',           element: <ResetPasswordPage /> },
      { path: '/verify-email',             element: <VerifyEmailPage /> },
      { path: '/verify-email-pending',     element: <VerifyEmailPendingPage /> },
      { path: '/terms',                    element: <TermsPage /> },
      { path: '/privacy',                  element: <PrivacyPage /> },

      // Admin + Landlord + Employee
      {
        element: <ProtectedRoute allowedRoles={['admin', 'landlord', 'employee']} />,
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

      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
])
