import { useState, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert, Box, Button, Dialog, DialogTitle, DialogContent,
  MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
  useTheme, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import ChargeAmountCell from '../../components/charges/ChargeAmountCell'
import ChargeDetailDrawer from '../../components/charges/ChargeDetailDrawer'
import LeasePicker from '../../components/pickers/LeasePicker'
import UnitPicker from '../../components/pickers/UnitPicker'
import { useProperties } from '../../hooks/useProperties'
import { useCharges, useCreateCharge } from '../../hooks/useCharges'
import { useAuthStore } from '../../store/authStore'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  unitId:      z.string().uuid('Unit is required'),
  leaseId:     z.string().uuid().optional().or(z.literal('')),
  chargeType:  z.enum(['rent', 'late_fee', 'utility', 'maintenance', 'other']),
  amount:      z.coerce.number().positive(),
  dueDate:     z.string().min(1, 'Due date is required'),
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
      <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
    </Stack>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChargesPage() {
  const navigate   = useNavigate()
  const user       = useAuthStore((s) => s.user)
  const isLandlord = user?.role === 'landlord'
  const isEmployee = user?.role === 'employee'
  const theme      = useTheme()
  const isMobile   = useMediaQuery(theme.breakpoints.down('sm'))

  const [createOpen,   setCreateOpen]   = useState(false)
  const [detailCharge, setDetailCharge] = useState(null)

  // Filter state
  const [filterPropertyId, setFilterPropertyId] = useState(null)
  const [filterLeaseId,    setFilterLeaseId]     = useState(null)
  const [statusFilter,     setStatusFilter]      = useState('all')

  const { data: propsData } = useProperties()
  const properties = Array.isArray(propsData) ? propsData : (propsData?.properties ?? [])

  // Admins require a property or lease filter to avoid huge unscoped queries.
  const adminHasFilter = !!(filterPropertyId || filterLeaseId)
  const shouldLoad     = isLandlord || isEmployee || adminHasFilter

  const backendParams = shouldLoad
    ? {
        ...(filterLeaseId                         ? { leaseId: filterLeaseId }       : {}),
        ...(filterPropertyId && !filterLeaseId    ? { propertyId: filterPropertyId } : {}),
        ...(statusFilter === 'unpaid'             ? { unpaidOnly: true }             : {}),
      }
    : undefined

  const { data, isLoading }             = useCharges(backendParams)
  const { mutate: create, isPending: creating } = useCreateCharge()

  const allRows = Array.isArray(data) ? data : (data?.charges ?? [])

  const rows = useMemo(() => {
    if (statusFilter === 'paid')    return allRows.filter((r) => r.status === 'paid')
    if (statusFilter === 'pending') return allRows.filter((r) => r.status === 'pending')
    if (statusFilter === 'voided')  return allRows.filter((r) => r.status === 'voided')
    return allRows
  }, [allRows, statusFilter])

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
  // Row click opens ChargeDetailDrawer — all CRUD lives there, not here.
  const columns = [
    { field: 'property_name', headerName: 'Property',         width: 150 },
    { field: 'unit_number',   headerName: 'Unit',             width: 80  },
    { field: 'charge_type',   headerName: 'Type',             width: 100 },
    { field: 'description',   headerName: 'Description', flex: 1, minWidth: 120 },
    {
      field: 'amount',
      headerName: 'Amount / Balance',
      width: 180,
      renderCell: ({ row }) => (
        <ChargeAmountCell
          amount={row.amount}
          totalPaid={row.total_paid}
          status={row.status}
          dueDate={row.due_date}
        />
      ),
    },
    { field: 'due_date', headerName: 'Due', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
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
        Linking a charge to a lease automatically updates the running balance in the Ledger.
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
        <DataTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          onRowClick={({ row }) => setDetailCharge(row)}
          rowHeight={64}
          sx={{ cursor: 'pointer' }}
        />
      )}

      {/* ── Create Charge Dialog ── */}
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

      {/* ── Charge Detail Drawer — CRUD hub: record payment / edit / history / void ── */}
      <ChargeDetailDrawer
        charge={detailCharge}
        onClose={() => setDetailCharge(null)}
      />
    </PageContainer>
  )
}