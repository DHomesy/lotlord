import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Card, CardContent, IconButton, LinearProgress,
  List, ListItem, ListItemIcon, ListItemText, Stack, Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { useAuthStore } from '../../store/authStore'
import { useProperties } from '../../hooks/useProperties'
import { useUnits } from '../../hooks/useUnits'
import { useTenants } from '../../hooks/useTenants'
import { useLeases } from '../../hooks/useLeases'
import { useConnectStatus } from '../../hooks/useStripeSetup'

const DISMISS_KEY = 'll_setup_done'

/**
 * Persistent setup checklist for new landlords.
 * - Self-contained: fetches its own data — can be rendered anywhere.
 * - Only shown for role='landlord' (never for admin).
 * - Dismissable via the × button. Auto-dismisses once all steps complete.
 * - Dismissal is persisted to localStorage, keyed by user ID so it resets per account.
 */
export default function LandlordSetupCard() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  // Key dismissal per user so QA / new accounts always see the card fresh
  const dismissKey = user?.id ? `${DISMISS_KEY}_${user.id}` : DISMISS_KEY
  const [dismissed, setDismissed] = useState(!!localStorage.getItem(dismissKey))

  const { data: propsData } = useProperties()
  const { data: unitsData } = useUnits()
  // includePending=true so tenants who accepted an invite but have no lease yet still count
  const { data: tenantsData } = useTenants({ includePending: 'true' })
  const { data: leasesData } = useLeases()
  const { data: connectStatus } = useConnectStatus()

  // Only for landlords
  if (!user || user.role !== 'landlord') return null
  if (dismissed) return null

  const properties = Array.isArray(propsData) ? propsData : (propsData?.properties ?? propsData?.data ?? [])
  const units = Array.isArray(unitsData) ? unitsData : (unitsData?.units ?? [])
  const tenants = Array.isArray(tenantsData) ? tenantsData : (tenantsData?.tenants ?? tenantsData?.data ?? [])
  const leases = Array.isArray(leasesData) ? leasesData : (leasesData?.leases ?? [])

  const steps = [
    {
      label: 'Add your first property',
      done: properties.length > 0,
      action: () => navigate('/properties'),
      actionLabel: 'Add Property',
    },
    {
      label: 'Add at least one unit to your property',
      done: units.length > 0,
      action: () => navigate('/properties'),
      actionLabel: 'View Properties',
    },
    {
      label: 'Invite your first tenant',
      done: tenants.length > 0,
      action: () => navigate('/tenants'),
      actionLabel: 'Invite Tenant',
    },
    {
      label: 'Create your first lease',
      done: leases.length > 0,
      action: () => navigate('/leases'),
      actionLabel: 'View Leases',
    },
    {
      label: 'Connect your bank account for rent payouts',
      done: connectStatus?.onboarded === true,
      action: () => navigate('/profile'),
      actionLabel: 'Open Profile',
    },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const allDone = completedCount === steps.length

  // Auto-dismiss and persist when all steps are done
  if (allDone) {
    localStorage.setItem(dismissKey, '1')
    return null
  }

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1')
    setDismissed(true)
  }

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: 'primary.light', bgcolor: 'primary.50' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Getting Started with LotLord
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {completedCount} of {steps.length} steps complete
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleDismiss} aria-label="Dismiss checklist">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <LinearProgress
          variant="determinate"
          value={(completedCount / steps.length) * 100}
          sx={{ borderRadius: 4, height: 6, mb: 1.5 }}
        />

        <List dense disablePadding>
          {steps.map((step) => (
            <ListItem key={step.label} disableGutters sx={{ py: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                {step.done
                  ? <CheckCircleIcon fontSize="small" color="success" />
                  : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
              </ListItemIcon>
              <ListItemText
                primary={step.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  color: step.done ? 'text.disabled' : 'text.primary',
                  sx: { textDecoration: step.done ? 'line-through' : 'none' },
                }}
              />
              {!step.done && (
                <Button size="small" variant="text" onClick={step.action} sx={{ flexShrink: 0 }}>
                  {step.actionLabel}
                </Button>
              )}
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  )
}
