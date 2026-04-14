import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import LoadingOverlay from '../components/common/LoadingOverlay'
import ChunkErrorBoundary from '../components/common/ChunkErrorBoundary'

const TenantDashboardPage   = lazy(() => import('../pages/tenant/DashboardPage'))
const TenantChargesPage     = lazy(() => import('../pages/tenant/ChargesPage'))
const TenantMaintenancePage = lazy(() => import('../pages/tenant/MaintenancePage'))
const TenantDocumentsPage   = lazy(() => import('../pages/tenant/DocumentsPage'))
const TenantProfilePage     = lazy(() => import('../pages/tenant/ProfilePage'))

const wrap = (el) => (
  <ChunkErrorBoundary>
    <Suspense fallback={<LoadingOverlay />}>{el}</Suspense>
  </ChunkErrorBoundary>
)

const tenantRoutes = [
  { path: '/my/dashboard',    element: wrap(<TenantDashboardPage />) },
  { path: '/my/charges',      element: wrap(<TenantChargesPage />) },
  // Legacy redirects
  { path: '/my/billing',      element: <Navigate to="/my/charges" replace /> },
  { path: '/my/payments',     element: <Navigate to="/my/charges" replace /> },
  { path: '/my/maintenance',  element: wrap(<TenantMaintenancePage />) },
  { path: '/my/documents',    element: wrap(<TenantDocumentsPage />) },
  { path: '/my/profile',      element: wrap(<TenantProfilePage />) },
]

export default tenantRoutes
