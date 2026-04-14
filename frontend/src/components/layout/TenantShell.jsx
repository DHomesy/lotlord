import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Toolbar,
  Typography,
  Box,
  Container,
  Tabs,
  Tab,
  Tooltip,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import DashboardIcon    from '@mui/icons-material/Dashboard'
import ReceiptLongIcon  from '@mui/icons-material/ReceiptLong'
import BuildIcon        from '@mui/icons-material/Build'
import FolderIcon       from '@mui/icons-material/Folder'
import PersonIcon       from '@mui/icons-material/Person'
import LogoutIcon       from '@mui/icons-material/Logout'
import { useLogout }     from '../../hooks/useAuth'
import { useAuthStore }  from '../../store/authStore'

const tenantNav = [
  { label: 'Dashboard',   path: '/my/dashboard',   icon: <DashboardIcon /> },
  { label: 'Charges',     path: '/my/charges',     icon: <ReceiptLongIcon /> },
  { label: 'Maintenance', path: '/my/maintenance', icon: <BuildIcon /> },
  { label: 'Documents',   path: '/my/documents',   icon: <FolderIcon /> },
  { label: 'Profile',     path: '/my/profile',     icon: <PersonIcon /> },
]

export default function TenantShell() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { mutate: logout } = useLogout()
  const user      = useAuthStore((s) => s.user)
  const theme     = useTheme()
  const isMobile  = useMediaQuery(theme.breakpoints.down('sm'))

  const activeIndex = tenantNav.findIndex((item) => location.pathname.startsWith(item.path))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* ── Top AppBar ── */}
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ whiteSpace: 'nowrap', mr: isMobile ? 'auto' : 2 }}>
            LotLord
          </Typography>

          {/* Scrollable tabs — visible on sm+ only */}
          {!isMobile && (
            <Tabs
              value={activeIndex === -1 ? false : activeIndex}
              variant="standard"
              textColor="inherit"
              TabIndicatorProps={{ style: { backgroundColor: 'white' } }}
              sx={{ flexGrow: 1, minHeight: 64 }}
            >
              {tenantNav.map((item) => (
                <Tab
                  key={item.path}
                  label={item.label}
                  component={Link}
                  to={item.path}
                  sx={{ minHeight: 64, textTransform: 'none', fontSize: '0.875rem' }}
                />
              ))}
            </Tabs>
          )}

          <Tooltip title={`Logout (${user?.email ?? ''})`}>
            <IconButton color="inherit" onClick={() => logout()} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* ── Main content — extra bottom padding on mobile so content clears the bottom nav ── */}
      <Container
        maxWidth="lg"
        sx={{ py: 3, flexGrow: 1, pb: isMobile ? '72px' : 3 }}
      >
        <Outlet />
      </Container>

      {/* ── Bottom navigation — mobile only ── */}
      {isMobile && (
        <Paper
          elevation={3}
          sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar }}
        >
          <BottomNavigation
            value={activeIndex === -1 ? 0 : activeIndex}
            onChange={(_, newIndex) => navigate(tenantNav[newIndex].path)}
            showLabels
          >
            {tenantNav.map((item) => (
              <BottomNavigationAction
                key={item.path}
                label={item.label}
                icon={item.icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
