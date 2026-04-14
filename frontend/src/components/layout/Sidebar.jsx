import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  Avatar,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material'
import DashboardIcon      from '@mui/icons-material/Dashboard'
import ApartmentIcon      from '@mui/icons-material/Apartment'
import PeopleIcon         from '@mui/icons-material/People'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import RequestQuoteIcon   from '@mui/icons-material/RequestQuote'
import PaymentIcon        from '@mui/icons-material/Payment'
import BuildIcon          from '@mui/icons-material/Build'
import FolderIcon         from '@mui/icons-material/Folder'
import NotificationsIcon  from '@mui/icons-material/Notifications'
import MailIcon           from '@mui/icons-material/Mail'
import ArticleIcon        from '@mui/icons-material/Article'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import PersonIcon         from '@mui/icons-material/Person'
import CardMembershipIcon from '@mui/icons-material/CardMembership'
import HistoryIcon        from '@mui/icons-material/History'

// ─── Nav item groups ───────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { label: 'Dashboard',   path: '/dashboard',   icon: <DashboardIcon /> },
      { label: 'Properties',  path: '/properties',  icon: <ApartmentIcon /> },
      { label: 'Tenants',     path: '/tenants',     icon: <PeopleIcon /> },
      { label: 'Maintenance', path: '/maintenance', icon: <BuildIcon /> },
      { label: 'Documents',   path: '/documents',   icon: <FolderIcon /> },
    ],
  },
  {
    label: 'Finance',
    roles: ['admin', 'landlord'],
    items: [
      { label: 'Ledger',  path: '/ledger',   icon: <AccountBalanceIcon />, roles: ['admin', 'landlord'] },
      { label: 'Charges', path: '/charges',  icon: <RequestQuoteIcon />,  roles: ['admin', 'landlord'] },
      { label: 'Billing', path: '/payments', icon: <PaymentIcon />,       roles: ['admin'] },
    ],
  },
  {
    label: 'Admin',
    roles: ['admin'],
    items: [
      { label: 'Notifications', path: '/notifications',           icon: <NotificationsIcon /> },
      { label: 'Templates',     path: '/notifications/templates', icon: <ArticleIcon /> },
      { label: 'Messages',      path: '/messages',                icon: <MailIcon /> },
      { label: 'Users',         path: '/users',                   icon: <ManageAccountsIcon /> },
      { label: 'Subscriptions', path: '/subscriptions',           icon: <CardMembershipIcon /> },
      { label: 'Audit Log',     path: '/audit',                   icon: <HistoryIcon /> },
    ],
  },
  {
    label: null, // no group label
    items: [
      { label: 'Profile', path: '/profile', icon: <PersonIcon /> },
    ],
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar({ role, user, onNavClick }) {
  const location = useLocation()

  const displayName = user?.firstName
    ? user.firstName
    : (user?.name || user?.email || '')
  const initials = displayName
    ? displayName.slice(0, 1).toUpperCase()
    : '?'
  const roleLabel = role === 'admin' ? 'Admin' : role === 'landlord' ? 'Landlord' : 'Tenant'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* User info card */}
      <Box
        sx={{
          px: 2, py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Avatar sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontSize: '0.9rem', fontWeight: 700 }}>
          {initials}
        </Avatar>
        <Box sx={{ overflow: 'hidden' }}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ lineHeight: 1.3 }}>
            {displayName}
          </Typography>
          <Chip
            label={roleLabel}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.65rem', mt: 0.25 }}
          />
        </Box>
      </Box>

      {/* Nav groups */}
      <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
        {NAV_GROUPS.map((group, gi) => {
          // Skip groups that require a role the user doesn't have
          if (group.roles && !group.roles.includes(role)) return null

          const visibleItems = group.items.filter(
            (item) => !item.roles || item.roles.includes(role),
          )
          if (!visibleItems.length) return null

          return (
            <Box key={gi}>
              {group.label && (
                <Typography
                  variant="overline"
                  sx={{
                    px: 2,
                    pt: gi === 0 ? 0.5 : 1.5,
                    pb: 0.25,
                    display: 'block',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'text.disabled',
                  }}
                >
                  {group.label}
                </Typography>
              )}
              <List disablePadding>
                {visibleItems.map((item) => {
                  const active = location.pathname === item.path ||
                    (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
                  return (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={item.path}
                        selected={active}
                        onClick={onNavClick}
                        sx={{
                          mx: 1,
                          mb: 0.25,
                          borderRadius: 1.5,
                          py: 0.85,
                          '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: '#fff',
                            '& .MuiListItemIcon-root': { color: '#fff' },
                            '&:hover': { bgcolor: 'primary.dark' },
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400 }}
                        />
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
              {gi < NAV_GROUPS.length - 1 && group.label && (
                <Divider sx={{ mx: 2, mt: 1 }} />
              )}
            </Box>
          )
        })}
      </Box>

    </Box>
  )
}
