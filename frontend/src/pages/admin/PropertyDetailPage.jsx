import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Grid, Card, CardContent, Button, Chip, Stack, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  TextField, Alert, useTheme, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import DescriptionIcon from '@mui/icons-material/Description'
import PageContainer from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import UnitForm from '../../components/forms/UnitForm'
import LeaseForm from '../../components/forms/LeaseForm'
import { useProperty, useDeleteProperty } from '../../hooks/useProperties'
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from '../../hooks/useUnits'
import { useLeases, useCreateLease } from '../../hooks/useLeases'
import { useCreateCharge } from '../../hooks/useCharges'

export default function PropertyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [createOpen,      setCreateOpen]      = useState(false)
  const [editingUnit,     setEditingUnit]      = useState(null)
  const [confirmDelete,   setConfirmDelete]    = useState(false)
  const [deleteStep1,     setDeleteStep1]      = useState(false)
  const [deleteStep2,     setDeleteStep2]      = useState(false)
  const [deleteNameInput, setDeleteNameInput]  = useState('')
  const [leaseUnit,       setLeaseUnit]        = useState(null)   // unit row to create lease for
  const [leaseChargeMsg,  setLeaseChargeMsg]   = useState(null)   // { type, text }

  const { data: property, isLoading: propLoading } = useProperty(id)
  const { data: unitsData, isLoading: unitsLoading } = useUnits({ propertyId: id })
  const { data: leasesData } = useLeases({ status: 'active' })
  const { mutate: createUnit, isPending: creating } = useCreateUnit()
  const { mutate: updateUnit, isPending: updating } = useUpdateUnit(editingUnit?.id)
  const { mutate: deleteUnit, isPending: deleting } = useDeleteUnit()
  const { mutate: deleteProperty, isPending: deletingProperty } = useDeleteProperty()
  const { mutate: createLease, isPending: creatingLease } = useCreateLease()
  const { mutateAsync: createCharge } = useCreateCharge()

  // Must be above the early return to respect React's Rules of Hooks
  const tenantByUnit = useMemo(() => {
    const allLeases = Array.isArray(leasesData) ? leasesData : (leasesData?.leases ?? [])
    const map = {}
    for (const l of allLeases) {
      if (l.unit_id && (l.first_name || l.last_name)) {
        map[l.unit_id] = [l.first_name, l.last_name].filter(Boolean).join(' ')
      }
    }
    return map
  }, [leasesData])

  if (propLoading) return <LoadingOverlay />

  const prop = property?.property ?? property
  const units = Array.isArray(unitsData) ? unitsData : (unitsData?.units ?? [])

  const vacantCount = units.filter((u) => u.status === 'vacant').length
  const maintenanceCount = units.filter((u) => u.status === 'maintenance').length

  const unitColumns = [
    { field: 'unit_number', headerName: 'Unit', width: 90 },
    { field: 'bedrooms', headerName: 'Beds', width: 60 },
    { field: 'bathrooms', headerName: 'Baths', width: 65 },
    { field: 'sq_ft', headerName: 'Sq Ft', width: 75, valueFormatter: (v) => v ? v.toLocaleString() : '—' },
    { field: 'rent_amount', headerName: 'Rent', width: 100, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
    {
      field: '_tenant',
      headerName: 'Tenant',
      flex: 1,
      valueGetter: (v, row) => tenantByUnit[row.id] ?? (row.status === 'occupied' ? 'Loading…' : '—'),
    },
    {
      field: '_edit',
      headerName: '',
      width: 160,
      sortable: false,
      filterable: false,
      valueGetter: () => '',
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            startIcon={<EditIcon />}
            onClick={(e) => { e.stopPropagation(); setEditingUnit(row) }}
          >
            Edit
          </Button>
          {row.status === 'vacant' && (
            <Tooltip title="Create a lease for this unit">
              <Button
                size="small"
                color="success"
                startIcon={<DescriptionIcon />}
                onClick={(e) => { e.stopPropagation(); setLeaseUnit(row); setLeaseChargeMsg(null) }}
              >
                Lease
              </Button>
            </Tooltip>
          )}
          {row.status === 'occupied' && (
            <Tooltip title="View lease for this unit">
              <Button
                size="small"
                color="primary"
                startIcon={<DescriptionIcon />}
                onClick={(e) => { e.stopPropagation(); navigate(`/leases?unitId=${row.id}`) }}
              >
                Lease
              </Button>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ]

  const handleCreateUnit = (values) => {
    createUnit({ ...values, propertyId: id }, { onSuccess: () => setCreateOpen(false) })
  }

  const handleUpdateUnit = (values) => {
    // Never send status: 'occupied' from the form — only vacant/maintenance are editable
    const payload = {
      unitNumber:  values.unitNumber,
      rentAmount:  values.rentAmount,
      bedrooms:    values.bedrooms,
      bathrooms:   values.bathrooms,
    }
    if (values.status && values.status !== 'occupied') {
      payload.status = values.status
    }
    updateUnit(payload, { onSuccess: () => setEditingUnit(null) })
  }

  const handleDeleteUnit = () => {
    deleteUnit(editingUnit.id, {
      onSuccess: () => { setConfirmDelete(false); setEditingUnit(null) },
    })
  }

  const handleDeleteProperty = () => {
    deleteProperty(id, {
      onSuccess: () => navigate('/properties'),
    })
  }

  /** Returns YYYY-MM-DD due-date strings for every month in [start, end] on the given day. */
  function getMonthlyDueDates(startDate, endDate, dueDay = 1) {
    const day = Math.max(1, Math.min(28, Number(dueDay) || 1))
    if (!startDate || !endDate) return []
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

  const handleCreateLease = (values) => {
    createLease({
      unitId:           values.unit_id,
      tenantId:         values.tenant_id,
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
            for (const fee of (values.additional_fees ?? [])) {
              if (!fee.description || !(Number(fee.amount) > 0)) continue
              for (const dueDate of dueDates) {
                tasks.push(createCharge({
                  unitId:      newLease.unit_id ?? values.unit_id,
                  leaseId:     newLease.id,
                  chargeType:  'other',
                  amount:      parseFloat(fee.amount),
                  dueDate,
                  description: fee.description,
                }))
              }
            }
            await Promise.all(tasks)
            const feeCount = (values.additional_fees ?? []).filter((f) => f.description && Number(f.amount) > 0).length
            const depLine  = values.include_deposit_charge && parseFloat(values.deposit_amount) > 0 ? ' + 1 deposit charge' : ''
            const feeLine  = feeCount > 0 ? ` + ${feeCount} additional fee type${feeCount !== 1 ? 's' : ''}` : ''
            setLeaseChargeMsg({ type: 'success', text: `Lease created with ${dueDates.length} monthly charge(s)${depLine}${feeLine}.` })
          } catch {
            setLeaseChargeMsg({ type: 'warning', text: 'Lease created, but some charges failed. Check the Charges page.' })
          }
        } else {
          setLeaseUnit(null)
        }
      },
    })
  }

  return (
    <PageContainer
      title={prop?.name ?? 'Property'}
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Add Unit
        </Button>
      }
    >
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <Typography variant="body2" color="text.secondary">Address</Typography>
              <Typography>
                {prop?.address_line1 || prop?.addressLine1}
                {prop?.address_line2 ? ` ${prop.address_line2}` : ''}
                {prop?.city ? `, ${prop.city}` : ''}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={2}>
              <Typography variant="body2" color="text.secondary">Type</Typography>
              <Typography sx={{ textTransform: 'capitalize' }}>{prop?.property_type ?? '—'}</Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Vacancy</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" color="info"    label={`${vacantCount} vacant`} />
                <Chip size="small" color="success" label={`${units.length - vacantCount - maintenanceCount} occupied`} />
                {maintenanceCount > 0 && (
                  <Chip size="small" color="warning" label={`${maintenanceCount} maintenance`} />
                )}
              </Stack>
            </Grid>
            <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: { sm: 'flex-end' } }}>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteStep1(true)}
              >
                Delete
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 1 }}>Units ({units.length})</Typography>
      {isMobile ? (
        <Stack spacing={1.5}>
          {unitsLoading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
          {!unitsLoading && units.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No units yet — click "Add Unit" to get started.
            </Typography>
          )}
          {units.map((unit) => (
            <Card key={unit.id} variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">Unit {unit.unit_number}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[unit.bedrooms && `${unit.bedrooms} bd`, unit.bathrooms && `${unit.bathrooms} ba`, unit.sq_ft && `${unit.sq_ft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5 }}>${Number(unit.rent_amount).toLocaleString()}/mo</Typography>
                    {tenantByUnit[unit.id] && (
                      <Typography variant="body2" color="text.secondary">{tenantByUnit[unit.id]}</Typography>
                    )}
                  </Box>
                  <StatusChip status={unit.status} />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button size="small" startIcon={<EditIcon />} onClick={() => setEditingUnit(unit)}>Edit</Button>
                  {unit.status === 'vacant' && (
                    <Button size="small" color="success" startIcon={<DescriptionIcon />}
                      onClick={() => { setLeaseUnit(unit); setLeaseChargeMsg(null) }}>Lease</Button>
                  )}
                  {unit.status === 'occupied' && (
                    <Button size="small" color="primary" startIcon={<DescriptionIcon />}
                      onClick={() => navigate(`/leases?unitId=${unit.id}`)}>Lease</Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <DataTable rows={units} columns={unitColumns} loading={unitsLoading} />
      )}

      {/* Add Unit */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Add Unit</DialogTitle>
        <DialogContent>
          <UnitForm onSubmit={handleCreateUnit} loading={creating} />
        </DialogContent>
      </Dialog>

      {/* Edit Unit */}
      <Dialog open={!!editingUnit} onClose={() => setEditingUnit(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Edit Unit {editingUnit?.unit_number}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {prop?.name}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {editingUnit && (
            <>
              <UnitForm
                key={editingUnit.id}
                isEdit
                defaultValues={{
                  unitNumber: editingUnit.unit_number,
                  bedrooms:   editingUnit.bedrooms   ?? 0,
                  bathrooms:  editingUnit.bathrooms  ?? 0,
                  rentAmount: editingUnit.rent_amount ?? 0,
                  status:     editingUnit.status,
                }}
                onSubmit={handleUpdateUnit}
                loading={updating}
              />
              <Stack direction="row" justifyContent="flex-start" sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  size="small"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Unit
                </Button>
              </Stack>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Unit {editingUnit?.unit_number}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This cannot be undone. Units with an active or pending lease cannot be deleted — terminate the lease first.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteUnit} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete property — step 1: warning */}
      <Dialog open={deleteStep1} onClose={() => setDeleteStep1(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Archive property?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will archive <strong>{prop?.name}</strong> along with all its units. Active leases will
            be terminated and the property will be removed from your dashboard.
            Financial records (payments, charges) are preserved.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteStep1(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => { setDeleteStep1(false); setDeleteNameInput(''); setDeleteStep2(true) }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete property — step 2: type name to confirm */}
      <Dialog open={deleteStep2} onClose={() => setDeleteStep2(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm archive</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Type <strong>{prop?.name}</strong> to confirm.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Property name"
            value={deleteNameInput}
            onChange={(e) => setDeleteNameInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteStep2(false)} disabled={deletingProperty}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteNameInput !== prop?.name || deletingProperty}
            onClick={handleDeleteProperty}
          >
            {deletingProperty ? 'Archiving…' : 'Archive Property'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Lease for a specific vacant unit */}
      <Dialog
        open={!!leaseUnit}
        onClose={() => { setLeaseUnit(null); setLeaseChargeMsg(null) }}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          New Lease — Unit {leaseUnit?.unit_number}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {prop?.name}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {leaseChargeMsg?.type === 'success' ? (
            <Alert
              severity="success"
              action={
                <Button size="small" onClick={() => { setLeaseUnit(null); setLeaseChargeMsg(null) }}>
                  Done
                </Button>
              }
            >
              {leaseChargeMsg.text}
            </Alert>
          ) : (
            <>
              {leaseChargeMsg?.type === 'warning' && (
                <Alert severity="warning" sx={{ mb: 2 }}>{leaseChargeMsg.text}</Alert>
              )}
              <LeaseForm
                onSubmit={handleCreateLease}
                loading={creatingLease}
                hideUnitPicker
                defaultValues={{ unit_id: leaseUnit?.id }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
