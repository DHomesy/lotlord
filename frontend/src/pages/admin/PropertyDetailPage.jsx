import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Grid, Card, CardContent, Button, Chip, Stack,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PageContainer from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import UnitForm from '../../components/forms/UnitForm'
import { useProperty, useDeleteProperty } from '../../hooks/useProperties'
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from '../../hooks/useUnits'
import { useLeases } from '../../hooks/useLeases'

export default function PropertyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [createOpen,      setCreateOpen]      = useState(false)
  const [editingUnit,     setEditingUnit]      = useState(null)
  const [confirmDelete,   setConfirmDelete]    = useState(false)
  const [deleteStep1,     setDeleteStep1]      = useState(false)
  const [deleteStep2,     setDeleteStep2]      = useState(false)
  const [deleteNameInput, setDeleteNameInput]  = useState('')

  const { data: property, isLoading: propLoading } = useProperty(id)
  const { data: unitsData, isLoading: unitsLoading } = useUnits({ propertyId: id })
  const { data: leasesData } = useLeases({ status: 'active' })
  const { mutate: createUnit, isPending: creating } = useCreateUnit()
  const { mutate: updateUnit, isPending: updating } = useUpdateUnit(editingUnit?.id)
  const { mutate: deleteUnit, isPending: deleting } = useDeleteUnit()
  const { mutate: deleteProperty, isPending: deletingProperty } = useDeleteProperty()

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
      width: 80,
      sortable: false,
      filterable: false,
      valueGetter: () => '',
      renderCell: ({ row }) => (
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={(e) => { e.stopPropagation(); setEditingUnit(row) }}
        >
          Edit
        </Button>
      ),
    },
  ]

  const handleCreateUnit = (values) => {
    createUnit({ ...values, propertyId: id }, { onSuccess: () => setCreateOpen(false) })
  }

  const handleUpdateUnit = (values) => {
    // Never send status: 'occupied' from the form — only vacant/maintenance are editable
    const payload = {
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
      <DataTable rows={units} columns={unitColumns} loading={unitsLoading} />

      {/* Add Unit */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Unit</DialogTitle>
        <DialogContent>
          <UnitForm onSubmit={handleCreateUnit} loading={creating} />
        </DialogContent>
      </Dialog>

      {/* Edit Unit */}
      <Dialog open={!!editingUnit} onClose={() => setEditingUnit(null)} maxWidth="sm" fullWidth>
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
    </PageContainer>
  )
}
