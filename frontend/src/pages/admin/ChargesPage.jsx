import { useState, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert, Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useTheme, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import BlockIcon from '@mui/icons-material/Block'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import StatusChip from '../../components/common/StatusChip'
import LeasePicker from '../../components/pickers/LeasePicker'
import UnitPicker from '../../components/pickers/UnitPicker'
import { useProperties } from '../../hooks/useProperties'
import { useCharges, useCreateCharge, useUpdateCharge, useVoidCharge } from '../../hooks/useCharges'
import { useAuthStore } from '../../store/authStore'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  unitId: z.string().uuid('Unit is required'),
  leaseId: z.string().uuid().optional().or(z.literal('')),
  chargeType: z.enum(['rent', 'late_fee', 'utility', 'maintenance', 'other']),
  amount: z.coerce.number().positive(),
  dueDate: z.string().min(1, 'Due date is required'),
  description: z.string().optional(),
})

const editSchema = z.object({
  chargeType: z.enum(['rent', 'late_fee', 'utility', 'maintenance', 'other']),
  dueDate: z.string().min(1, 'Due date is required'),
  description: z.string().optional(),
})

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateChargeForm({ onSubmit, loading }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { chargeType: 'rent' },
  })
  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <Controller
        name="unitId"
        control={control}
        render={({ field }) => (
          <UnitPicker
            value={field.value ?? null}
            onChange={field.onChange}
            error={!!errors.unitId}
            helperText={errors.unitId?.message}
          />
        )}
      />
      <Controller
        name="leaseId"
        control={control}
        render={({ field }) => (
          <LeasePicker
            value={field.value ?? null}
            onChange={field.onChange}
            label="Link to Lease (optional)"
            onlyActive={false}
            error={!!errors.leaseId}
            helperText={errors.leaseId?.message}
          />
        )}
      />
      <Controller
        name="chargeType"
        control={control}
        render={({ field }) => (
          <TextField label="Type" select {...field} error={!!errors.chargeType}>
            {['rent', 'late_fee', 'utility', 'maintenance', 'other'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField label="Amount ($)" type="number" {...register('amount')} error={!!errors.amount} helperText={errors.amount?.message} />
      <TextField label="Due Date" type="date" InputLabelProps={{ shrink: true }} {...register('dueDate')} error={!!errors.dueDate} helperText={errors.dueDate?.message} />
      <TextField label="Description" {...register('description')} />
      <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
    </Stack>
  )
}

// ─── Edit Form ────────────────────────────────────────────────────────────────

function EditChargeForm({ charge, onSubmit, loading, onCancel }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      chargeType:  charge?.charge_type ?? 'rent',
      dueDate:     charge?.due_date?.slice(0, 10) ?? '',
      description: charge?.description ?? '',
    },
  })
  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <Controller
        name="chargeType"
        control={control}
        render={({ field }) => (
          <TextField label="Type" select {...field} error={!!errors.chargeType}>
            {['rent', 'late_fee', 'utility', 'maintenance', 'other'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField label="Due Date" type="date" InputLabelProps={{ shrink: true }} {...register('dueDate')} error={!!errors.dueDate} helperText={errors.dueDate?.message} />
      <TextField label="Description" {...register('description')} />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
      </Stack>
    </Stack>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChargesPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isLandlord = user?.role === 'landlord'
  const isEmployee = user?.role === 'employee'
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [createOpen, setCreateOpen] = useState(false)
  const [editCharge, setEditCharge] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)

  // Filter state
  const [filterPropertyId, setFilterPropertyId] = useState(null)
  const [filterLeaseId, setFilterLeaseId] = useState(null)
  // 'all' | 'unpaid' | 'pending' | 'paid' | 'voided'
  const [statusFilter, setStatusFilter] = useState('all')

  // Properties for the filter dropdown
  const { data: propsData } = useProperties()
  const properties = Array.isArray(propsData) ? propsData : (propsData?.properties ?? [])

  // Landlords always load (ownerId scoping happens server-side).
  // Admins require at least a property or lease selection to avoid huge unscoped queries.
  const adminHasFilter = !!(filterPropertyId || filterLeaseId)
  const shouldLoad = isLandlord || isEmployee || adminHasFilter

  // Build backend query params. unpaidOnly handled server-side for the Unpaid filter;
  // Paid and Voided are filtered client-side from the full dataset.
  const backendParams = shouldLoad
    ? {
        ...(filterLeaseId    ? { leaseId: filterLeaseId }       : {}),
        ...(filterPropertyId && !filterLeaseId ? { propertyId: filterPropertyId } : {}),
        ...(statusFilter === 'unpaid' ? { unpaidOnly: true } : {}),
      }
    : undefined

  // All hooks must be declared before any conditional return (React Rules of Hooks).
  const { data, isLoading } = useCharges(backendParams)
  const { mutate: create, isPending: creating } = useCreateCharge()
  const { mutate: update, isPending: updating } = useUpdateCharge()
  const { mutate: doVoid, isPending: voiding } = useVoidCharge()

  const allRows = Array.isArray(data) ? data : (data?.charges ?? [])

  // Client-side status filter for Paid / Pending / Voided (avoids an extra backend trip)
  const rows = useMemo(() => {
    if (statusFilter === 'paid')    return allRows.filter((r) => r.status === 'paid')
    if (statusFilter === 'pending') return allRows.filter((r) => r.status === 'pending')
    if (statusFilter === 'voided')  return allRows.filter((r) => r.status === 'voided')
    return allRows
  }, [allRows, statusFilter])

  // If the landlord has no properties yet, prompt them to add one first.
  // This return is intentionally placed AFTER all hooks above.
  if (isLandlord && propsData !== undefined && properties.length === 0) {
    return (
      <PageContainer title="Charges">
        <EmptyState
          message="You need to add a property before you can create charges."
          onAdd={() => navigate('/properties')}
          addLabel="Go to Properties"
        />
      </PageContainer>
    )
  }

  // ─── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    { field: 'property_name', headerName: 'Property', width: 160 },
    { field: 'unit_number',   headerName: 'Unit',     width: 90 },
    { field: 'charge_type',   headerName: 'Type',     width: 110 },
    { field: 'description',   headerName: 'Description', flex: 1 },
    { field: 'amount', headerName: 'Amount', width: 110, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'due_date', headerName: 'Due', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusChip status={value} />,
    },
    {
      field: '_actions',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: ({ row }) => {
        const canAct = row.status !== 'voided' && row.status !== 'paid'
        return (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Edit">
              <span>
                <IconButton size="small" disabled={!canAct} onClick={() => setEditCharge(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {!isEmployee && (
            <Tooltip title="Void charge">
              <span>
                <IconButton size="small" color="error" disabled={!canAct} onClick={() => setVoidTarget(row)}>
                  <BlockIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            )}
          </Stack>
        )
      },
    },
  ]

  return (
    <PageContainer
      title="Charges"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Charge
        </Button>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Charges are amounts billed to a lease — rent due, late fees, utilities, etc.
        Linking a charge to a lease automatically updates the tenant's running balance in the Ledger.
      </Typography>

      {/* ── Filters ── */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ maxWidth: 760 }}>
          <TextField
            select
            label="Property"
            value={filterPropertyId ?? ''}
            onChange={(e) => { setFilterPropertyId(e.target.value || null); setFilterLeaseId(null) }}
            sx={{ minWidth: 220 }}
            size="small"
          >
            <MenuItem value="">All Properties</MenuItem>
            {properties.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ minWidth: 280 }}>
            <LeasePicker
              value={filterLeaseId}
              onChange={(v) => setFilterLeaseId(v)}
              label="Lease (optional)"
              onlyActive={false}
            />
          </Box>
        </Stack>

        {/* Status filter */}
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(_, v) => { if (v) setStatusFilter(v) }}
          size="small"
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="unpaid">Unpaid</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="paid">Paid</ToggleButton>
          <ToggleButton value="voided">Voided</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {!shouldLoad ? (
        <Alert severity="info">Select a property or lease above to view charges.</Alert>
      ) : !isLoading && rows.length === 0 ? (
        <EmptyState
          message="No charges found for the selected filters."
          onAdd={() => setCreateOpen(true)}
          addLabel="Add Charge"
        />
      ) : (
        <DataTable rows={rows} columns={columns} loading={isLoading} />
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>New Charge</DialogTitle>
        <DialogContent>
          <CreateChargeForm
            onSubmit={(v) => {
              const payload = { ...v }
              if (!payload.leaseId) delete payload.leaseId
              create(payload, { onSuccess: () => setCreateOpen(false) })
            }}
            loading={creating}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editCharge} onClose={() => setEditCharge(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Charge</DialogTitle>
        <DialogContent>
          <EditChargeForm
            charge={editCharge}
            onSubmit={(v) => {
              update(
                { id: editCharge.id, chargeType: v.chargeType, dueDate: v.dueDate, description: v.description },
                { onSuccess: () => setEditCharge(null) },
              )
            }}
            loading={updating}
            onCancel={() => setEditCharge(null)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Void Confirm Dialog ── */}
      <Dialog open={!!voidTarget} onClose={() => setVoidTarget(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Void Charge?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will cancel the{' '}
            <strong>${Number(voidTarget?.amount ?? 0).toLocaleString()} {voidTarget?.charge_type}</strong> charge
            due <strong>{voidTarget?.due_date?.slice(0, 10)}</strong>.
            {voidTarget?.lease_id && " A credit entry will be appended to the tenant's ledger to reverse the balance."}
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={voiding}
            onClick={() => doVoid(voidTarget.id, { onSuccess: () => setVoidTarget(null) })}
          >
            {voiding ? 'Voiding…' : 'Void Charge'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  )
}
