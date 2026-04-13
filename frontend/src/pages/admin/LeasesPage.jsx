import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Dialog, DialogTitle, DialogContent, Stack,
  Checkbox, FormControlLabel, Alert, Typography, Box,
  ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import StatusChip from '../../components/common/StatusChip'
import LeaseForm from '../../components/forms/LeaseForm'
import { useLeases, useCreateLease } from '../../hooks/useLeases'
import { useCreateCharge } from '../../hooks/useCharges'

const ACTIVE_STATUSES   = ['active', 'pending']
const ARCHIVED_STATUSES = ['expired', 'terminated']

/** Returns YYYY-MM-01 strings for every month in [startDate, endDate] */
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

export default function LeasesPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [addCharges,  setAddCharges]  = useState(false)
  const [chargeMsg,   setChargeMsg]   = useState(null)
  const [view,        setView]        = useState('active') // 'active' | 'archived'

  const { data, isLoading } = useLeases()
  const { mutate: create, isPending: creating } = useCreateLease()
  const { mutateAsync: createCharge } = useCreateCharge()

  const allRows     = Array.isArray(data) ? data : (data?.leases ?? [])
  const activeRows  = allRows.filter((r) => ACTIVE_STATUSES.includes(r.status))
  const archivedRows = allRows.filter((r) => ARCHIVED_STATUSES.includes(r.status))
  const rows = view === 'active' ? activeRows : archivedRows

  const columns = [
    { field: 'tenant_name', headerName: 'Tenant', flex: 1, valueGetter: (v, row) => row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.tenant_id },
    { field: 'property_name', headerName: 'Property', flex: 1, valueGetter: (v, row) => row.property_name ?? '—' },
    { field: 'unit_number', headerName: 'Unit', width: 90 },
    { field: 'start_date', headerName: 'Start', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'end_date', headerName: 'End', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'monthly_rent', headerName: 'Rent', width: 110, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
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
          onClick={(e) => { e.stopPropagation(); navigate(`/leases/${row.id}/edit`) }}
        >
          Edit
        </Button>
      ),
    },
  ]

  const handleCreate = async (values) => {
    create({
      unitId:        values.unit_id,
      tenantId:      values.tenant_id,
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
            setChargeMsg({ type: 'warning', text: 'Lease created, but some charges failed. Check the Charges page.' })
          }
        } else {
          setCreateOpen(false)
        }
      },
    })
  }

  return (
    <PageContainer
      title="Leases"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setChargeMsg(null); setAddCharges(false) }}>
          New Lease
        </Button>
      }
    >
      {/* Active / Archived toggle */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => { if (v) setView(v) }}
          size="small"
        >
          <ToggleButton value="active">
            Active
            {activeRows.length > 0 && (
              <Chip label={activeRows.length} size="small" color="primary" sx={{ ml: 1, height: 18, fontSize: 11 }} />
            )}
          </ToggleButton>
          <ToggleButton value="archived">
            Archived
            {archivedRows.length > 0 && (
              <Chip label={archivedRows.length} size="small" sx={{ ml: 1, height: 18, fontSize: 11 }} />
            )}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message={view === 'active' ? 'No active leases. Create a lease to get started.' : 'No archived leases.'}
          onAdd={view === 'active' ? () => { setCreateOpen(true); setChargeMsg(null); setAddCharges(false) } : undefined}
          addLabel="New Lease"
        />
      ) : (
        <DataTable rows={rows} columns={columns} loading={isLoading} />
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Lease</DialogTitle>
        <DialogContent>
          <LeaseForm onSubmit={handleCreate} loading={creating}>
            {/* Auto-charges opt-in — rendered inside the form, above the submit button */}
            <Box sx={{ mt: 1 }}>
              <Typography variant="overline" color="text.secondary">Charges</Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={addCharges}
                    onChange={(e) => setAddCharges(e.target.checked)}
                  />
                }
                label="Auto-generate monthly rent charges for this lease period"
                sx={{ display: 'flex', mt: 0.5 }}
              />
              {addCharges && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  One rent charge will be created per month (due on the 1st) for the full lease period.
                  Charges will be visible on the <strong>Charges</strong> page after saving.
                </Alert>
              )}
              {chargeMsg && (
                <Alert
                  severity={chargeMsg.type}
                  sx={{ mt: 1 }}
                  action={
                    chargeMsg.type === 'success'
                      ? <Button size="small" onClick={() => setCreateOpen(false)}>Done</Button>
                      : undefined
                  }
                >
                  {chargeMsg.text}
                </Alert>
              )}
            </Box>
          </LeaseForm>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
