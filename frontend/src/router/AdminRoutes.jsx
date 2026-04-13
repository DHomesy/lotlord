import { lazy, Suspense } from 'react'
import LoadingOverlay from '../components/common/LoadingOverlay'

const DashboardPage       = lazy(() => import('../pages/admin/DashboardPage'))
const PropertiesPage      = lazy(() => import('../pages/admin/PropertiesPage'))
const PropertyDetailPage  = lazy(() => import('../pages/admin/PropertyDetailPage'))
const TenantsPage         = lazy(() => import('../pages/admin/TenantsPage'))
const TenantDetailPage    = lazy(() => import('../pages/admin/TenantDetailPage'))
const LeasesPage          = lazy(() => import('../pages/admin/LeasesPage'))
const EditLeasePage        = lazy(() => import('../pages/admin/EditLeasePage'))
const LedgerPage          = lazy(() => import('../pages/admin/LedgerPage'))
const ChargesPage         = lazy(() => import('../pages/admin/ChargesPage'))
const PaymentsPage        = lazy(() => import('../pages/admin/PaymentsPage'))
const MaintenancePage     = lazy(() => import('../pages/admin/MaintenancePage'))
const DocumentsPage       = lazy(() => import('../pages/admin/DocumentsPage'))
const NotificationsPage             = lazy(() => import('../pages/admin/NotificationsPage'))
const NotificationTemplatesPage     = lazy(() => import('../pages/admin/NotificationTemplatesPage'))
const MessagesPage                  = lazy(() => import('../pages/admin/MessagesPage'))
const UsersPage                     = lazy(() => import('../pages/admin/UsersPage'))
const AdminProfilePage              = lazy(() => import('../pages/admin/ProfilePage'))
const SubscriptionsPage             = lazy(() => import('../pages/admin/SubscriptionsPage'))
const AuditLogPage                  = lazy(() => import('../pages/admin/AuditLogPage'))

const wrap = (el) => <Suspense fallback={<LoadingOverlay />}>{el}</Suspense>

const adminRoutes = [
  { path: '/dashboard',         element: wrap(<DashboardPage />) },
  { path: '/properties',        element: wrap(<PropertiesPage />) },
  { path: '/properties/:id',    element: wrap(<PropertyDetailPage />) },
  { path: '/tenants',           element: wrap(<TenantsPage />) },
  { path: '/tenants/:id',       element: wrap(<TenantDetailPage />) },
  { path: '/leases',            element: wrap(<LeasesPage />) },
  { path: '/leases/:id/edit',   element: wrap(<EditLeasePage />) },
  { path: '/ledger',            element: wrap(<LedgerPage />) },
  { path: '/charges',           element: wrap(<ChargesPage />) },
  { path: '/payments',          element: wrap(<PaymentsPage />) },
  { path: '/maintenance',       element: wrap(<MaintenancePage />) },
  { path: '/documents',         element: wrap(<DocumentsPage />) },
  { path: '/notifications',              element: wrap(<NotificationsPage />) },
  { path: '/notifications/templates',    element: wrap(<NotificationTemplatesPage />) },
  { path: '/messages',                   element: wrap(<MessagesPage />) },
  { path: '/users',                      element: wrap(<UsersPage />) },
  { path: '/subscriptions',              element: wrap(<SubscriptionsPage />) },
  { path: '/audit',                      element: wrap(<AuditLogPage />) },
  { path: '/profile',                    element: wrap(<AdminProfilePage />) },
]

export default adminRoutes
