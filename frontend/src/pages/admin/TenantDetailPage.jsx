import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Card, CardContent, Chip, Dialog, DialogTitle,
  DialogContent, Divider, Grid, Stack, Typography, Box,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import PageContainer from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import LeaseForm from '../../components/forms/LeaseForm'
import { useTenant } from '../../hooks/useTenants'
import { useLeases, useCreateLease } from '../../hooks/useLeases'
import { useCreateCharge } from '../../hooks/useCharges'

const ACTIVE_STATUSES = ['active', 'pending']

/** Returns YYYY-MM-DD strings for every monthly due date in [startDate, endDate]. */
function getMonthlyDueDates(startDate, endDate, dueDay = 1) {
  const day = Math.max(1, Math.min(28, Number(dueDay) || 1))
  if (!startDate || !endDate) return []
  // Parse as local time to avoid UTC-midnight rollback across month boundaries
  const [sy, sm, sd] = String(startDate).slice(0, 10).split('-').map(Number)
  const [ey, em, ed] = String(endDate).slice(0, 10).split('-').map(Number)
  const s = new Date(sy, sm - 1, sd)
  const e = new Date(ey, em - 1, ed)
  if (isNaN(s) || isNaN(e) || e <= s) return []
  const dates = []
  const cur = new Date(s.getFullYear(), s.getMonth(), day)
  if (cur < s) cur.setMonth(cur.getMonth() + 1)
  while (cur <= e) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return dates
}

function InfoField({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </Box>
  )
}

const historyColumns = [
  {
    field: 'property_name', headerName: 'Property', flex: 1,
    valueGetter: (v, row) => row.property_name
      ? `${row.property_name}${row.unit_number ? ` — Unit ${row.unit_number}` : ''}`
      : '—',
  },
  { field: 'start_date', headerName: 'Start', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
  { field: 'end_date',   headerName: 'End',   width: 110, valueFormatter: (v) => v?.slice(0, 10) },
  { field: 'monthly_rent', headerName: 'Rent', width: 110, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
]

export default function TenantDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [createOpen,  setCreateOpen]  = useState(false)
  const [chargeMsg,   setChargeMsg]   = useState(null)

  const { data: tenantData, isLoading: tLoading } = useTenant(id)
  const { data: leasesData, isLoading: lLoading }  = useLeases({ tenantId: id })
  const { mutate: create, isPending: creating }    = useCreateLease()
  const { mutateAsync: createCharge }              = useCreateCharge()

  if (tLoading) return <LoadingOverlay />

  const tenant = tenantData?.tenant ?? tenantData
  const allLeases    = Array.isArray(leasesData) ? leasesData : (leasesData?.leases ?? [])
  const activeLease  = allLeases.find((l) => ACTIVE_STATUSES.includes(l.status))
  const pastLeases   = allLeases.filter((l) => !ACTIVE_STATUSES.includes(l.status))

  const tenantName = [tenant?.first_name, tenant?.last_name].filter(Boolean).join(' ') || 'Tenant'

  const handleCreate = (values) => {
    create({
      unitId:           values.unit_id,
      tenantId:         id,
      startDate:        values.start_date,
      endDate:          values.end_date,
      monthlyRent:      values.rent_amount,
      depositAmount:    values.deposit_amount,
      lateFeeAmount:    parseFloat(values.late_fee_amount)    || 0,
      lateFeeGraceDays: parseInt(values.late_fee_grace_days) || 0,
    }, {
      onSuccess: async (newLease) => {
        if (values.auto_charges) {
          const dueDates = getMonthlyDueDates(values.start_date, values.end_date, values.charge_due_day)
          try {
            const tasks = dueDates.map((dueDate) =>
              createCharge({
                unitId:     newLease.unit_id ?? values.unit_id,
                leaseId:    newLease.id,
                chargeType: 'rent',
                amount:     parseFloat(values.rent_amount),
                dueDate,
              })
            )
            if (values.include_deposit_charge && parseFloat(values.deposit_amount) > 0) {
              tasks.push(createCharge({
                unitId:      newLease.unit_id ?? values.unit_id,
                leaseId:     newLease.id,
                chargeType:  'other',
                amount:      parseFloat(values.deposit_amount),
                dueDate:     values.start_date,
                description: 'Security deposit',
              }))
            }
            await Promise.all(tasks)
            const depLine = values.include_deposit_charge && parseFloat(values.deposit_amount) > 0
              ? ' + 1 deposit charge'
              : ''
            setChargeMsg({ type: 'success', text: `Lease created with ${dueDates.length} monthly charge(s)${depLine}.` })
          } catch {
            setChargeMsg({ type: 'warning', text: 'Lease created, but some charges failed.' })
          }
        } else {
          setCreateOpen(false)
        }
      },
    })
  }

  return (
    <PageContainer
      title={tenantName}
      actions={
        <Stack direction="row" spacing={1}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/tenants')}>
            Back
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setCreateOpen(true); setChargeMsg(null) }}
          >
            New Lease
          </Button>
        </Stack>
      }
    >
      {/* ── Profile ── */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Contact</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}><InfoField label="Email" value={tenant?.email} /></Grid>
            <Grid item xs={12} sm={4}><InfoField label="Phone" value={tenant?.phone} /></Grid>
            <Grid item xs={12} sm={4}><InfoField label="Emergency Contact" value={tenant?.emergency_contact_name} /></Grid>
            {tenant?.notes && (
              <Grid item xs={12}><InfoField label="Notes" value={tenant.notes} /></Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* ── Active Lease ── */}
      <Typography variant="h6" sx={{ mb: 1 }}>Active Lease</Typography>
      {activeLease ? (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1} sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1" fontWeight={600}>
                  {activeLease.property_name
                    ? `${activeLease.property_name}${activeLease.unit_number ? ` — Unit ${activeLease.unit_number}` : ''}`
                    : 'Lease'}
                </Typography>
                <StatusChip status={activeLease.status} />
              </Stack>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/leases/${activeLease.id}/edit`)}
              >
                Edit Lease
              </Button>
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}><InfoField label="Monthly Rent" value={`$${Number(activeLease.monthly_rent).toLocaleString()}`} /></Grid>
              <Grid item xs={6} sm={3}><InfoField label="Deposit" value={activeLease.deposit_amount ? `$${Number(activeLease.deposit_amount).toLocaleString()}` : null} /></Grid>
              <Grid item xs={6} sm={3}><InfoField label="Start" value={activeLease.start_date?.slice(0, 10)} /></Grid>
              <Grid item xs={6} sm={3}><InfoField label="End" value={activeLease.end_date?.slice(0, 10)} /></Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : (
        <Typography color="text.secondary" sx={{ mb: 3 }}>No active lease. Use "New Lease" to create one.</Typography>
      )}

      {/* ── Lease History ── */}
      {pastLeases.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Lease History</Typography>
          <DataTable rows={pastLeases} columns={historyColumns} loading={lLoading} />
        </>
      )}

      {/* ── Create lease dialog ── */}
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setChargeMsg(null) }} maxWidth="md" fullWidth>
        <DialogTitle>New Lease for {tenantName}</DialogTitle>
        <DialogContent>
          {chargeMsg?.type === 'success' ? (
            <Alert
              severity="success"
              action={<Button size="small" onClick={() => { setCreateOpen(false); setChargeMsg(null) }}>Done</Button>}
            >
              {chargeMsg.text}
            </Alert>
          ) : (
            <>
              {chargeMsg?.type === 'warning' && (
                <Alert severity="warning" sx={{ mb: 2 }}>{chargeMsg.text}</Alert>
              )}
              <LeaseForm
                onSubmit={handleCreate}
                loading={creating}
                hideTenantPicker
                defaultValues={{ tenant_id: id }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
