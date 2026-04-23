import { Grid, Card, CardContent, Typography, Divider, Box, Button, Alert, Chip } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import HouseIcon from '@mui/icons-material/House'
import DescriptionIcon from '@mui/icons-material/Description'
import BuildIcon from '@mui/icons-material/Build'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../components/layout/PageContainer'
import StatusChip from '../../components/common/StatusChip'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import { useMyLease } from '../../hooks/useTenants'
import { useMyPaymentMethods } from '../../hooks/useStripeSetup'
import { useLedger } from '../../hooks/useLedger'
import { useCharges } from '../../hooks/useCharges'
import { useAuthStore } from '../../store/authStore'

function InfoCard({ label, value, children }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>{label}</Typography>
        {children ?? <Typography variant="h6">{value ?? '—'}</Typography>}
      </CardContent>
    </Card>
  )
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
  return diff
}

function NoLeaseEmptyState() {
  const navigate = useNavigate()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        py: 8,
        px: 2,
      }}
    >
      <HouseIcon sx={{ fontSize: 72, color: 'text.disabled', mb: 2 }} />
      <Typography variant="h6" fontWeight={600} gutterBottom>
        No lease found yet
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 380, mb: 4 }}>
        Your landlord hasn&apos;t set up a lease for you yet. You&apos;ll receive an email as soon as one is ready.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<DescriptionIcon />}
          onClick={() => navigate('/my/documents')}
        >
          My Documents
        </Button>
        <Button
          variant="outlined"
          startIcon={<BuildIcon />}
          onClick={() => navigate('/my/maintenance')}
        >
          Maintenance
        </Button>
      </Box>
    </Box>
  )
}

function PendingLeaseState({ lease }) {
  const navigate = useNavigate()
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <HourglassEmptyIcon color="warning" />
        <Typography variant="h6">
          {lease.property_name}
          {lease.address_line1 ? ` \u2014 ${lease.address_line1}` : ''}
        </Typography>
        <Chip label="Pending" color="warning" size="small" />
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>
        Your lease is <strong>pending activation</strong>. Your landlord will activate it shortly
        \u2014 you&apos;ll receive an email confirmation when it&apos;s ready.
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard label="Unit" value={lease.unit_number} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard label="Monthly Rent">
            <Typography variant="h6">${Number(lease.monthly_rent).toLocaleString()}</Typography>
          </InfoCard>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard label="Lease Start" value={lease.start_date?.slice(0, 10)} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard label="Lease End" value={lease.end_date?.slice(0, 10)} />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={() => navigate('/my/documents')}>
          My Documents
        </Button>
        <Button variant="outlined" startIcon={<BuildIcon />} onClick={() => navigate('/my/maintenance')}>
          Maintenance
        </Button>
      </Box>
    </Box>
  )
}

export default function TenantDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { tenantMe, activeLease, leases, isLoading } = useMyLease()
  const pendingLease = leases?.find((l) => l.status === 'pending') ?? null
  const { data: paymentMethods } = useMyPaymentMethods()
  const { data: ledgerData } = useLedger(activeLease ? { leaseId: activeLease.id } : undefined)
  const { data: chargesData } = useCharges(tenantMe?.id ? { forTenantId: tenantMe.id } : undefined)
  const days = daysUntil(activeLease?.end_date)
  const navigate = useNavigate()

  const displayName = user?.firstName || user?.email || 'Tenant'
  const hasPaymentMethod = Array.isArray(paymentMethods) && paymentMethods.length > 0

  const amountDueNow = ledgerData?.amountDueNow ?? null
  const allCharges = Array.isArray(chargesData) ? chargesData : (chargesData?.charges ?? [])
  const nextCharge = allCharges
    .filter((c) => c.status === 'unpaid' && c.due_date > new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null

  if (isLoading) return <LoadingOverlay />

  return (
    <PageContainer title={`Welcome, ${displayName}`}>
      {activeLease ? (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <HomeIcon color="primary" />
            <Typography variant="h6">
              {activeLease.property_name}
              {activeLease.address_line1 ? ` — ${activeLease.address_line1}` : ''}
            </Typography>
            <StatusChip status={activeLease.status} />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <InfoCard label="Unit" value={activeLease.unit_number} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoCard label="Monthly Rent">
                <Typography variant="h6">${Number(activeLease.monthly_rent).toLocaleString()}</Typography>
              </InfoCard>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoCard label="Lease Start" value={activeLease.start_date?.slice(0, 10)} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoCard label="Lease End">
                <Typography variant="h6">{activeLease.end_date?.slice(0, 10)}</Typography>
                {days !== null && (
                  <Typography variant="caption" color={days <= 60 ? 'warning.main' : 'text.secondary'}>
                    {days > 0 ? `${days} days remaining` : 'Expired'}
                  </Typography>
                )}
              </InfoCard>
            </Grid>
            {activeLease.deposit_amount && Number(activeLease.deposit_amount) > 0 && (
              <Grid item xs={12} sm={6} md={3}>
                <InfoCard label="Security Deposit" value={`$${Number(activeLease.deposit_amount).toLocaleString()}`} />
              </Grid>
            )}
            {activeLease.late_fee_amount && Number(activeLease.late_fee_amount) > 0 && (
              <Grid item xs={12} sm={6} md={3}>
                <InfoCard
                  label="Late Fee"
                  value={`$${Number(activeLease.late_fee_amount).toLocaleString()} after ${activeLease.late_fee_grace_days ?? 5} days`}
                />
              </Grid>
            )}
          </Grid>

          {leases.filter((l) => l.status !== 'active' && l.status !== 'pending').length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Past Leases</Typography>
              <Grid container spacing={2}>
                {leases.filter((l) => l.status !== 'active' && l.status !== 'pending').map((l) => (
                  <Grid item xs={12} sm={6} key={l.id}>
                    <Card variant="outlined">
                      <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2">{l.property_name} — Unit {l.unit_number}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {l.start_date?.slice(0, 10)} → {l.end_date?.slice(0, 10)}
                          </Typography>
                        </Box>
                        <StatusChip status={l.status} />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          {/* ── Financial summary ── */}
          {(amountDueNow !== null || nextCharge) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Financial Summary</Typography>
              <Grid container spacing={2}>
                {amountDueNow !== null && (
                  <Grid item xs={12} sm={6} md={3}>
                    <InfoCard label="Amount Due Today">
                      <Typography
                        variant="h6"
                        color={amountDueNow > 0 ? 'error.main' : 'success.main'}
                        fontWeight={600}
                      >
                        {amountDueNow > 0 ? `$${Number(amountDueNow).toLocaleString()}` : 'All paid up!'}
                      </Typography>
                    </InfoCard>
                  </Grid>
                )}
                {nextCharge && (
                  <Grid item xs={12} sm={6} md={3}>
                    <InfoCard label="Next Charge Due">
                      <Typography variant="h6" fontWeight={600}>
                        ${Number(nextCharge.amount).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {nextCharge.charge_type} — due {nextCharge.due_date?.slice(0, 10)}
                      </Typography>
                    </InfoCard>
                  </Grid>
                )}
              </Grid>
            </>
          )}
        </Box>
      ) : pendingLease ? (
        <PendingLeaseState lease={pendingLease} />
      ) : (
        <NoLeaseEmptyState />
      )}

      {/* ── Bank account setup prompt ── */}
      {!hasPaymentMethod && (
        <Alert
          severity="info"
          sx={{ mt: 3 }}
          action={
            <Button size="small" variant="outlined" onClick={() => navigate('/my/profile')}>
              Set up now
            </Button>
          }
        >
          Add a bank account to pay rent online directly from your dashboard.
        </Alert>
      )}

      {/* ── Quick navigation cards ── */}
      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Quick access
      </Typography>
      <Grid container spacing={2}>
        {[
          { label: 'Charges & Payments', icon: <ReceiptLongIcon color="primary" />, path: '/my/charges' },
          { label: 'Maintenance',        icon: <BuildIcon       color="primary" />, path: '/my/maintenance' },
          { label: 'Documents',          icon: <DescriptionIcon color="primary" />, path: '/my/documents' },
          { label: 'My Profile',         icon: <AccountBalanceIcon color="primary" />, path: '/my/profile' },
        ].map(({ label, icon, path }) => (
          <Grid item xs={6} sm={3} key={path}>
            <Card
              variant="outlined"
              onClick={() => navigate(path)}
              sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main', boxShadow: 1 }, transition: 'box-shadow 0.15s, border-color 0.15s' }}
            >
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 2 }}>
                {icon}
                <Typography variant="body2" fontWeight={500} textAlign="center">{label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContainer>
  )
}
