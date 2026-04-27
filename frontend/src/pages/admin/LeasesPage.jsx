import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Alert, Typography,
  ToggleButtonGroup, ToggleButton, Chip,
  useTheme, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import StatusChip from '../../components/common/StatusChip'
import LeaseForm from '../../components/forms/LeaseForm'
import { useLeases, useCreateLease } from '../../hooks/useLeases'
import { useCreateChargesBatch, useVoidChargesByUnit } from '../../hooks/useCharges'
import { getCharges as fetchCharges } from '../../api/charges'
import { uploadDocument } from '../../api/documents'

const ACTIVE_STATUSES   = ['active', 'pending']
const ARCHIVED_STATUSES = ['expired', 'terminated']

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

export default function LeasesPage() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [createOpen, setCreateOpen] = useState(false)
  const [chargeMsg,    setChargeMsg]    = useState(null)
  const [confirmState, setConfirmState] = useState(null) // { pendingValues, pendingLease, pendingCharges, existingCount }
  const [view,         setView]         = useState('active') // 'active' | 'archived'

  const { data, isLoading } = useLeases()
  const { mutate: create, isPending: creating } = useCreateLease()
  const { mutateAsync: createChargesBatch, isPending: batchCreating } = useCreateChargesBatch()
  const { mutateAsync: voidChargesByUnit } = useVoidChargesByUnit()

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

  /** Build the full charges array from form values + new lease record. */
  function buildChargesPayload(values, newLease, dueDates) {
    const unitId   = newLease.unit_id   ?? values.unit_id
    const tenantId = newLease.tenant_id ?? values.tenant_id
    const charges  = dueDates.map((dueDate) => ({
      unitId, leaseId: newLease.id, tenantId, chargeType: 'rent',
      amount: parseFloat(values.rent_amount), dueDate,
    }))
    if (values.include_deposit_charge && parseFloat(values.deposit_amount) > 0) {
      charges.push({
        unitId, leaseId: newLease.id, tenantId, chargeType: 'other',
        amount: parseFloat(values.deposit_amount), dueDate: values.start_date,
        description: 'Security deposit',
      })
    }
    for (const fee of (values.additional_fees ?? [])) {
      if (!fee.description || !(Number(fee.amount) > 0)) continue
      for (const dueDate of dueDates) {
        charges.push({
          unitId, leaseId: newLease.id, tenantId, chargeType: 'other',
          amount: parseFloat(fee.amount), dueDate, description: fee.description,
        })
      }
    }
    return charges
  }

  /** Fire the batch (optionally voiding existing charges first) and set the result message. */
  async function runBatch(values, newLease, charges, shouldVoidFirst) {
    try {
      if (shouldVoidFirst) {
        await voidChargesByUnit({ unitId: newLease.unit_id ?? values.unit_id })
      }
      await createChargesBatch({ charges })
      const dueDates = getMonthlyDueDates(values.start_date, values.end_date, values.charge_due_day)
      const feeCount = (values.additional_fees ?? []).filter((f) => f.description && Number(f.amount) > 0).length
      const depLine  = values.include_deposit_charge && parseFloat(values.deposit_amount) > 0 ? ' + 1 deposit charge' : ''
      const feeLine  = feeCount > 0 ? ` + ${feeCount} additional fee type${feeCount !== 1 ? 's' : ''}` : ''
      setChargeMsg({ type: 'success', text: `Lease created with ${dueDates.length} monthly charge(s)${depLine}${feeLine}.` })
    } catch {
      setChargeMsg({ type: 'warning', text: 'Lease created, but some charges failed. Check the Charges page.' })
    }
  }

  const handleCreate = (values) => {
    create({
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
        // Upload attached lease document if provided (fire-and-forget — doc upload failure
        // does not roll back a successfully created lease)
        if (values.attachedFile) {
          const fd = new FormData()
          fd.append('file', values.attachedFile)
          fd.append('relatedType', 'lease')
          fd.append('relatedId', newLease.id)
          fd.append('category', 'lease')
          uploadDocument(fd).catch(() => {})
        }

        if (!values.auto_charges) { setCreateOpen(false); return }

        const dueDates = getMonthlyDueDates(values.start_date, values.end_date, values.charge_due_day)
        const charges  = buildChargesPayload(values, newLease, dueDates)

        // Check for pre-existing unpaid charges on this unit — warn before overwriting
        try {
          const existing = await fetchCharges({ unitId: newLease.unit_id ?? values.unit_id })
          if (Array.isArray(existing) && existing.length > 0) {
            setConfirmState({ pendingValues: values, pendingLease: newLease, pendingCharges: charges, existingCount: existing.length })
            return
          }
        } catch { /* if check fails, proceed without warning */ }

        await runBatch(values, newLease, charges, false)
      },
    })
  }

  return (
    <PageContainer
      title="Leases"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setChargeMsg(null) }}>
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
          onAdd={view === 'active' ? () => { setCreateOpen(true); setChargeMsg(null) } : undefined}
          addLabel="New Lease"
        />
      ) : (
        <DataTable rows={rows} columns={columns} loading={isLoading} />
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setChargeMsg(null) }} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>New Lease</DialogTitle>
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
              <LeaseForm onSubmit={handleCreate} loading={creating} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Pre-existing charges confirmation */}
      <Dialog open={!!confirmState} onClose={() => setConfirmState(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Existing Charges Found</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This unit already has <strong>{confirmState?.existingCount}</strong> existing
            charge{confirmState?.existingCount !== 1 ? 's' : ''}. What would you like to do?
          </Alert>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 2, pt: 0 }}>
          <Button
            variant="contained"
            color="warning"
            fullWidth
            disabled={batchCreating}
            onClick={async () => {
              const { pendingValues, pendingLease, pendingCharges } = confirmState
              setConfirmState(null)
              await runBatch(pendingValues, pendingLease, pendingCharges, true)
            }}
          >
            Replace — void existing &amp; create new schedule
          </Button>
          <Button
            variant="outlined"
            fullWidth
            disabled={batchCreating}
            onClick={async () => {
              const { pendingValues, pendingLease, pendingCharges } = confirmState
              setConfirmState(null)
              await runBatch(pendingValues, pendingLease, pendingCharges, false)
            }}
          >
            Keep existing and add new schedule
          </Button>
          <Button
            variant="text"
            color="inherit"
            fullWidth
            onClick={() => {
              setConfirmState(null)
              setChargeMsg({ type: 'success', text: 'Lease created. No charge schedule was generated.' })
            }}
          >
            <Typography variant="body2" color="text.secondary">Skip — don't create charges</Typography>
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  )
}
