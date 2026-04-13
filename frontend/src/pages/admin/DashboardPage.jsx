import {
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Box,
  Stack,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
} from '@mui/material'
import TrendingUpIcon    from '@mui/icons-material/TrendingUp'
import WarningAmberIcon  from '@mui/icons-material/WarningAmber'
import ApartmentIcon     from '@mui/icons-material/Apartment'
import BuildIcon         from '@mui/icons-material/Build'
import CheckCircleIcon   from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import PageContainer     from '../../components/layout/PageContainer'
import LoadingOverlay    from '../../components/common/LoadingOverlay'
import { useDashboard }  from '../../hooks/useAnalytics'
import { useConnectStatus } from '../../hooks/useStripeSetup'
import { useMySubscription, useCreateCheckoutSession } from '../../hooks/useBilling'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// ─── Formatters ─────────────────────────────────────────────────────────────
const currency = new Intl.NumberFormat('en-US', {
  style:                 'currency',
  currency:              'USD',
  maximumFractionDigits: 0,
})
const fmt  = (v) => currency.format(v ?? 0)
const pct  = (v) => `${Math.round((v ?? 0) * 100)}%`
const date = (v) => v ? new Date(v).toLocaleDateString() : '—'

// ─── Priority / status chip colours ─────────────────────────────────────────
const PRIORITY_COLOR = {
  emergency: 'error',
  high:      'warning',
  medium:    'info',
  low:       'default',
}
const STATUS_COLOR = {
  completed:   'success',
  in_progress: 'info',
  open:        'default',
  cancelled:   'default',
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text.primary', Icon, progress }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
          {Icon && <Icon fontSize="small" sx={{ color: 'text.secondary' }} />}
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>

        <Typography variant="h4" fontWeight={700} color={color}>
          {value}
        </Typography>

        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}

        {progress !== undefined && (
          <Box mt={1}>
            <LinearProgress
              variant="determinate"
              value={Math.min(progress * 100, 100)}
              sx={{ borderRadius: 4, height: 6 }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Activity table ───────────────────────────────────────────────────────────
function ActivityTable({ head, children, empty }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {head.map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 600 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {children}
              {empty && (
                <TableRow>
                  <TableCell
                    colSpan={head.length}
                    align="center"
                    sx={{ py: 3, color: 'text.secondary' }}
                  >
                    {empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
function SetupChecklist({ hasProperties, connectOnboarded, isPro, isLandlord }) {
  const navigate = useNavigate()
  const checkout = useCreateCheckoutSession()

  const steps = [
    {
      label: 'Add your first property',
      done: hasProperties,
      action: () => navigate('/properties'),
      actionLabel: 'Go to Properties',
    },
    // Stripe Connect payout and subscription are landlord-only features
    isLandlord && {
      label: 'Complete Stripe Connect payout setup',
      done: connectOnboarded,
      action: () => navigate('/profile'),
      actionLabel: 'Open Profile',
    },
    isLandlord && {
      label: 'Upgrade to Pro for portfolio analytics & no limits',
      done: isPro,
      action: () => checkout.mutate(),
      actionLabel: 'Upgrade Now',
    },
  ].filter(Boolean)

  const allDone = steps.every((s) => s.done)
  if (allDone) return null

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: 'primary.light', bgcolor: 'primary.50' }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Getting Started
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Complete these steps to make the most of PropertyManager.
        </Typography>
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
                <Button size="small" variant="text" onClick={step.action} disabled={checkout.isPending}>
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

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard()
  const { data: connectStatus } = useConnectStatus()
  const { data: subscription } = useMySubscription()
  const { mutate: checkout, isPending: checkingOut } = useCreateCheckoutSession()
  const user = useAuthStore((s) => s.user)
  const isLandlord = user?.role === 'landlord'

  if (isLoading) return <LoadingOverlay />

  const isPro = ['active', 'trialing'].includes(subscription?.status)

  // Analytics is Pro-gated — show upgrade prompt for free-tier users
  if (isError) {
    const is402 = error?.response?.status === 402
    return (
      <PageContainer title="Dashboard">
        {is402 ? (
          <Alert
            severity="info"
            action={
              <Button size="small" variant="contained" onClick={() => checkout()} disabled={checkingOut}>
                Upgrade to Pro
              </Button>
            }
          >
            Portfolio analytics are available on the Pro plan. Upgrade to unlock your dashboard metrics.
          </Alert>
        ) : (
          <Alert severity="error">
            Failed to load dashboard metrics. Please refresh the page.
          </Alert>
        )}
      </PageContainer>
    )
  }

  const {
    monthlyIncome,
    unpaidDues,
    occupancyRate,
    totalUnits,
    occupiedUnits,
    recentPayments    = [],
    recentMaintenance = [],
  } = data

  const connectOnboarded = connectStatus?.onboarded === true

  return (
    <PageContainer title="Dashboard">
      <SetupChecklist
        hasProperties={totalUnits > 0}
        connectOnboarded={connectOnboarded}
        isPro={isPro}
        isLandlord={isLandlord}
      />

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Monthly Income"
            value={fmt(monthlyIncome)}
            sub="Sum of active lease rents"
            color="success.main"
            Icon={TrendingUpIcon}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Unpaid Dues"
            value={fmt(unpaidDues)}
            sub="Overdue charges with no payment"
            color={unpaidDues > 0 ? 'error.main' : 'text.primary'}
            Icon={WarningAmberIcon}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Occupancy Rate"
            value={pct(occupancyRate)}
            sub={`${occupiedUnits} of ${totalUnits} units occupied`}
            Icon={ApartmentIcon}
            progress={occupancyRate}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Open Maintenance"
            value={recentMaintenance.length < 5 ? recentMaintenance.length : '5+'}
            sub="Open & in-progress requests"
            Icon={BuildIcon}
          />
        </Grid>
      </Grid>

      {/* ── Activity tables ───────────────────────────────────────────────── */}
      <Grid container spacing={3} mt={0.5}>
        {/* Recent payments */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            Recent Payments
          </Typography>
          <ActivityTable
            head={['Tenant', 'Unit', 'Amount', 'Date', 'Method']}
            empty={recentPayments.length === 0 ? 'No payments yet' : undefined}
          >
            {recentPayments.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.first_name} {p.last_name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                  {p.address_line1} — {p.unit_number}
                </TableCell>
                <TableCell>{fmt(p.amount_paid)}</TableCell>
                <TableCell>{date(p.payment_date)}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>
                  {p.payment_method.replace(/_/g, ' ')}
                </TableCell>
              </TableRow>
            ))}
          </ActivityTable>
        </Grid>

        {/* Recent maintenance */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            Recent Maintenance
          </Typography>
          <ActivityTable
            head={['Title', 'Unit', 'Priority', 'Status']}
            empty={recentMaintenance.length === 0 ? 'No open requests' : undefined}
          >
            {recentMaintenance.map((m) => (
              <TableRow key={m.id} hover>
                <TableCell>{m.title}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                  {m.address_line1} — {m.unit_number}
                </TableCell>
                <TableCell>
                  <Chip
                    label={m.priority}
                    size="small"
                    color={PRIORITY_COLOR[m.priority] ?? 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={m.status.replace('_', ' ')}
                    size="small"
                    variant="outlined"
                    color={STATUS_COLOR[m.status] ?? 'default'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </ActivityTable>
        </Grid>
      </Grid>
    </PageContainer>
  )
}
