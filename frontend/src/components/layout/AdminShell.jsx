import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Tooltip,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import Sidebar from './Sidebar'
import { useLogout } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/authStore'

const DRAWER_WIDTH = 260

export default function AdminShell() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)
  const { mutate: logout } = useLogout()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const [planLimitDialog, setPlanLimitDialog] = useState(null) // { message, code }

  useEffect(() => {
    const handler = (e) => setPlanLimitDialog(e.detail)
    window.addEventListener('plan-limit-exceeded', handler)
    return () => window.removeEventListener('plan-limit-exceeded', handler)
  }, [])

  const drawerContent = <Sidebar role={user?.role} user={user} onNavClick={() => setMobileOpen(false)} />

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            LotLord
          </Typography>
          <Tooltip title="Logout">
            <IconButton color="inherit" onClick={() => logout()} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Desktop: permanent drawer */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', overflow: 'hidden' },
          }}
        >
          <Toolbar />
          {drawerContent}
        </Drawer>
      )}

      {/* Mobile: temporary drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {/* Spacer so the first nav item isn't hidden behind the fixed AppBar */}
          <Toolbar />
          {drawerContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          overflow: 'hidden',
          minHeight: '100vh',
          bgcolor: 'grey.50',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>

      {/* Plan limit upgrade dialog — triggered by 402 PLAN_LIMIT from any API call */}
      <Dialog
        open={!!planLimitDialog}
        onClose={() => setPlanLimitDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Plan Limit Reached</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {planLimitDialog?.message ?? 'You have reached the limit for your current plan.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanLimitDialog(null)}>Dismiss</Button>
          <Button
            variant="contained"
            onClick={() => { setPlanLimitDialog(null); navigate('/profile#subscription') }}
          >
            Upgrade Plan
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
