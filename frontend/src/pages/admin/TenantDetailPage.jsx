import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Card, CardContent, Chip, Dialog, DialogTitle,
  DialogContent, Divider, Grid, Stack, Typography, Box,
  FormControlLabel, Checkbox, Alert,
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

function getMonthlyDueDates(startDate, endDate) {
  if (!startDate || !endDate) return []
  const dates = []
  const cur = new Date(String(startDate).slice(0, 10))
  cur.setDate(1)
  const end = new Date(String(endDate).slice(0, 10))
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    dates.push(`${y}-${m}-01`)
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
  const [addCharges,  setAddCharges]  = useState(false)
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
      unitId:        values.unit_id,
      tenantId:      id,
      startDate:     values.start_date,
      endDate:       values.end_date,
      monthlyRent:   values.rent_amount,
      depositAmount: values.deposit_amount,
    }, {
      onSuccess: async (newLease) => {
        if (addCharges) {
          const dueDates = getMonthlyDueDates(values.start_date, values.end_date)
          try {
            await Promise.all(
              dueDates.map((dueDate) =>
                createCharge({
                  unitId:     newLease.unit_id ?? values.unit_id,
                  leaseId:    newLease.id,
                  chargeType: 'rent',
                  amount:     parseFloat(values.rent_amount),
                  dueDate,
                })
              )
            )
            setChargeMsg({ type: 'success', text: `Lease created with ${dueDates.length} monthly charge(s).` })
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
            onClick={() => { setCreateOpen(true); setChargeMsg(null); setAddCharges(false) }}
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
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Lease for {tenantName}</DialogTitle>
        <DialogContent>
          {chargeMsg ? (
            <Alert severity={chargeMsg.type} sx={{ mt: 1 }}>
              {chargeMsg.text}
              {chargeMsg.type === 'success' && (
                <Button size="small" sx={{ ml: 1 }} onClick={() => setCreateOpen(false)}>Done</Button>
              )}
            </Alert>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <LeaseForm
                onSubmit={handleCreate}
                loading={creating}
                hideTenantPicker
                defaultValues={{ tenant_id: id }}
              />
              <FormControlLabel
                control={
                  <Checkbox checked={addCharges} onChange={(e) => setAddCharges(e.target.checked)} />
                }
                label="Auto-generate monthly rent charges for this lease"
              />
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
