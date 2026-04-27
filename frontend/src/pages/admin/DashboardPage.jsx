import { useState } from 'react'
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
  Button,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import TrendingUpIcon    from '@mui/icons-material/TrendingUp'
import WarningAmberIcon  from '@mui/icons-material/WarningAmber'
import ApartmentIcon     from '@mui/icons-material/Apartment'
import BuildIcon         from '@mui/icons-material/Build'
import BarChartIcon      from '@mui/icons-material/BarChart'
import GroupIcon         from '@mui/icons-material/Group'
import HomeWorkIcon      from '@mui/icons-material/HomeWork'
import LockIcon          from '@mui/icons-material/Lock'
import PageContainer     from '../../components/layout/PageContainer'
import LoadingOverlay    from '../../components/common/LoadingOverlay'
import LandlordSetupCard from '../../components/common/LandlordSetupCard'
import { useDashboard }  from '../../hooks/useAnalytics'
import { useConnectStatus } from '../../hooks/useStripeSetup'
import { useMySubscription } from '../../hooks/useBilling'
import { hasStarter } from '../../lib/plans'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import OnboardingWizard from '../../components/common/OnboardingWizard'

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
function ActivityTable({ head, children, empty, isMobile, mobileRows }) {
  if (isMobile && mobileRows) {
    return (
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          {mobileRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>
              {empty}
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderBottom: 1, borderColor: 'divider' }} />} spacing={0}>
              {mobileRows}
            </Stack>
          )}
        </CardContent>
      </Card>
    )
  }

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
export default function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard()
  const { data: connectStatus } = useConnectStatus()
  const { data: subscription } = useMySubscription()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isLandlord = user?.role === 'landlord'
  const isEmployee = user?.role === 'employee'
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [wizardOpen, setWizardOpen] = useState(() => {
    const key = user?.id ? `ll_onboarding_done_${user.id}` : 'll_onboarding_done'
    return !localStorage.getItem(key) && isLandlord
  })

  if (isLoading) return <LoadingOverlay />

  const isStarter = hasStarter(subscription)

  // Analytics is Starter-gated — show upgrade prompt for free-tier users.
  // This check must come BEFORE the !data guard so free-tier landlords see the
  // upgrade prompt instead of an infinite loading spinner (402 → isError=true, data=undefined).
  if (isError) {
    const is402 = error?.response?.status === 402
    return (
      <PageContainer title="Dashboard">
        <LandlordSetupCard />
        {is402 ? (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              {isEmployee
                ? 'Portfolio analytics require an active subscription. Contact your employer to upgrade.'
                : "You're on the Free plan. Upgrade to Starter to unlock full dashboard analytics and more."}
              {!isEmployee && (
                <Button size="small" variant="contained" sx={{ ml: 2 }} onClick={() => navigate('/profile#subscription')}>
                  Upgrade Now
                </Button>
              )}
            </Alert>

            {/* ── Free tier feature showcase ─────────────────────────────── */}
            {!isEmployee && (
              <Box>
                <Typography variant="h6" fontWeight={600} mb={1}>
                  What you unlock with Starter ($15/mo)
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Everything below is available the moment you upgrade — no setup required.
                </Typography>
                <Grid container spacing={2}>
                  {[
                    {
                      Icon: BarChartIcon,
                      title: 'Portfolio Analytics',
                      desc: 'Live dashboard: monthly income, occupancy rate, unpaid dues, and recent payment history across all your properties.',
                    },
                    {
                      Icon: HomeWorkIcon,
                      title: 'Up to 25 Properties',
                      desc: 'Free plan is limited to 1 property and 4 units. Starter gives you 25 properties with unlimited units.',
                    },
                    {
                      Icon: GroupIcon,
                      title: 'Team Members (Enterprise)',
                      desc: 'Add property managers and staff who can manage leases and maintenance on your behalf. Available on Enterprise.',
                    },
                  ].map(({ Icon, title, desc }) => (
                    <Grid item xs={12} sm={4} key={title}>
                      <Card variant="outlined" sx={{ height: '100%', opacity: 0.85 }}>
                        <CardContent>
                          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                            <Icon fontSize="small" color="primary" />
                            <Typography variant="subtitle2" fontWeight={600}>{title}</Typography>
                            <LockIcon fontSize="inherit" sx={{ color: 'text.disabled', ml: 'auto' }} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">{desc}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                <Divider sx={{ my: 3 }} />
                <Stack direction="row" justifyContent="center">
                  <Button variant="contained" size="large" onClick={() => navigate('/profile#subscription')}>
                    Upgrade to Starter — $15/mo
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
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
      <OnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onAddProperty={() => navigate('/properties')}
        storageKey={user?.id ? `ll_onboarding_done_${user.id}` : 'll_onboarding_done'}
      />

      <LandlordSetupCard />

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
            isMobile={isMobile}
            mobileRows={recentPayments.map((p) => (
              <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 1 }}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>{p.first_name} {p.last_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.address_line1} — {p.unit_number}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 1 }}>
                  <Typography variant="body2" fontWeight={500}>{fmt(p.amount_paid)}</Typography>
                  <Typography variant="caption" color="text.secondary">{date(p.payment_date)}</Typography>
                </Box>
              </Box>
            ))}
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
            isMobile={isMobile}
            mobileRows={recentMaintenance.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 1 }}>
                <Box sx={{ mr: 1 }}>
                  <Typography variant="body2" fontWeight={500}>{m.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.address_line1} — {m.unit_number}</Typography>
                </Box>
                <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                  <Chip label={m.priority} size="small" color={PRIORITY_COLOR[m.priority] ?? 'default'} />
                  <Chip label={m.status.replace('_', ' ')} size="small" variant="outlined" color={STATUS_COLOR[m.status] ?? 'default'} />
                </Stack>
              </Box>
            ))}
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
