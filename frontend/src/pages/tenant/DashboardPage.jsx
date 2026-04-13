import { Grid, Card, CardContent, Typography, Divider, Box } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import PageContainer from '../../components/layout/PageContainer'
import StatusChip from '../../components/common/StatusChip'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import { useMyLease } from '../../hooks/useTenants'
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

export default function TenantDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { activeLease, leases, isLoading } = useMyLease()
  const days = daysUntil(activeLease?.end_date)

  if (isLoading) return <LoadingOverlay />

  return (
    <PageContainer title={`Welcome, ${user?.name || user?.email || 'Tenant'}`}>
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

          {leases.filter((l) => l.status !== 'active').length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Past Leases</Typography>
              <Grid container spacing={2}>
                {leases.filter((l) => l.status !== 'active').map((l) => (
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
        </Box>
      ) : (
        <Typography color="text.secondary">No active lease found.</Typography>
      )}
    </PageContainer>
  )
}
