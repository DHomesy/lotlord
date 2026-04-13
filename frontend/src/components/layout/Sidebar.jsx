import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material'
import DashboardIcon    from '@mui/icons-material/Dashboard'
import ApartmentIcon    from '@mui/icons-material/Apartment'
import PeopleIcon       from '@mui/icons-material/People'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import RequestQuoteIcon  from '@mui/icons-material/RequestQuote'
import PaymentIcon       from '@mui/icons-material/Payment'
import BuildIcon         from '@mui/icons-material/Build'
import FolderIcon        from '@mui/icons-material/Folder'
import NotificationsIcon from '@mui/icons-material/Notifications'
import MailIcon          from '@mui/icons-material/Mail'
import ArticleIcon       from '@mui/icons-material/Article'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import PersonIcon         from '@mui/icons-material/Person'
import CardMembershipIcon from '@mui/icons-material/CardMembership'
import HistoryIcon        from '@mui/icons-material/History'

const adminNavItems = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Properties', path: '/properties', icon: <ApartmentIcon /> },
  { label: 'Tenants', path: '/tenants', icon: <PeopleIcon /> },
  { label: 'Maintenance', path: '/maintenance', icon: <BuildIcon /> },
  { label: 'Documents', path: '/documents', icon: <FolderIcon /> },
  { divider: true },
  { label: 'Ledger',   path: '/ledger',   icon: <AccountBalanceIcon />, roles: ['admin', 'landlord'] },
  { label: 'Charges',  path: '/charges',  icon: <RequestQuoteIcon />,  roles: ['admin', 'landlord'] },
  { label: 'Billing',  path: '/payments', icon: <PaymentIcon />,       roles: ['admin'] },
  { label: 'Notifications', path: '/notifications',           icon: <NotificationsIcon />, roles: ['admin'] },
  { label: 'Templates',     path: '/notifications/templates', icon: <ArticleIcon />,       roles: ['admin'] },
  { label: 'Messages',      path: '/messages',                icon: <MailIcon />,          roles: ['admin'] },
  { divider: true },
  { label: 'Users',         path: '/users',          icon: <ManageAccountsIcon />, roles: ['admin'] },
  { label: 'Subscriptions', path: '/subscriptions',  icon: <CardMembershipIcon />, roles: ['admin'] },
  { label: 'Audit Log',     path: '/audit',          icon: <HistoryIcon />,        roles: ['admin'] },
  { label: 'Profile',       path: '/profile',        icon: <PersonIcon /> },
]

export default function Sidebar({ role, onNavClick }) {
  const location = useLocation()

  return (
    <List dense>
      {adminNavItems.map((item, idx) => {
        if (item.divider) return <Divider key={idx} sx={{ my: 0.5 }} />
        if (item.roles && !item.roles.includes(role)) return null
        const active = location.pathname.startsWith(item.path)
        return (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={active}
              onClick={onNavClick}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        )
      })}
    </List>
  )
}
