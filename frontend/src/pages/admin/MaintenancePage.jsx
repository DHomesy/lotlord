import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, MenuItem, Stack, TextField, IconButton, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import MaintenanceDetailDrawer from '../../components/maintenance/MaintenanceDetailDrawer'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import StatusChip from '../../components/common/StatusChip'
import UnitPicker from '../../components/pickers/UnitPicker'
import {
  useMaintenance,
  useCreateMaintenanceRequest,
  useDeleteMaintenanceRequest,
} from '../../hooks/useMaintenance'

const CATEGORIES = ['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other']
const PRIORITIES = ['low', 'medium', 'high', 'emergency']

const createSchema = z.object({
  unitId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other'], {
    errorMap: () => ({ message: 'Category is required' }),
  }),
  priority: z.enum(['low', 'medium', 'high', 'emergency']).default('medium'),
})

function CreateForm({ onSubmit, loading }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'medium' },
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
      <TextField label="Title" {...register('title')} error={!!errors.title} />
      <TextField label="Description" multiline rows={3} {...register('description')} />
      <Controller name="category" control={control} render={({ field }) => (
        <TextField label="Category" select {...field} value={field.value ?? ''} error={!!errors.category} helperText={errors.category?.message}>
          {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>)}
        </TextField>
      )} />
      <Controller name="priority" control={control} render={({ field }) => (
        <TextField label="Priority" select {...field} value={field.value ?? 'medium'}>
          {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>)}
        </TextField>
      )} />
      <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
    </Stack>
  )
}

const columns = [
  { field: 'title', headerName: 'Title', flex: 1.5 },
  { field: 'unit_display', headerName: 'Unit', flex: 1, valueGetter: (v, row) => row.property_address ? `${row.property_address} - Unit ${row.unit_number}` : `Unit ${row.unit_number}` },
  { field: 'priority', headerName: 'Priority', width: 100 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'created_at', headerName: 'Submitted', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
]

export default function MaintenancePage() {
  const [createOpen, setCreateOpen]           = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [deletingRequest, setDeletingRequest] = useState(null)

  const { data, isLoading } = useMaintenance()
  const { mutate: create, isPending: creating } = useCreateMaintenanceRequest()
  const { mutate: remove, isPending: deleting } = useDeleteMaintenanceRequest()

  const rows = Array.isArray(data) ? data : (data?.requests ?? [])

  const handleRowClick = (params) => setSelectedRequest(params.row ?? params)

  const handleDelete = () => {
    remove(deletingRequest.id, {
      onSuccess: () => {
        setDeletingRequest(null)
        if (selectedRequest?.id === deletingRequest.id) setSelectedRequest(null)
      },
    })
  }

  const columnsWithDelete = [
    ...columns,
    {
      field: '_delete',
      headerName: '',
      width: 56,
      sortable: false,
      filterable: false,
      valueGetter: () => '',
      renderCell: ({ row }) => (
        <Tooltip title="Delete">
          <IconButton
            size="small"
            color="error"
            onClick={(e) => { e.stopPropagation(); setDeletingRequest(row) }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  return (
    <PageContainer
      title="Maintenance"
      actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New Request</Button>}
    >
      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No maintenance requests yet. Submit a request when something needs attention."
          onAdd={() => setCreateOpen(true)}
          addLabel="New Request"
        />
      ) : (
        <DataTable
          rows={rows}
          columns={columnsWithDelete}
          loading={isLoading}
          onRowClick={handleRowClick}
        />
      )}

      {/* Detail Drawer — row click opens */}
      <MaintenanceDetailDrawer
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
      />

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Request</DialogTitle>
        <DialogContent>
          <CreateForm onSubmit={(v) => create(v, { onSuccess: () => setCreateOpen(false) })} loading={creating} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deletingRequest} onClose={() => setDeletingRequest(null)}>
        <DialogTitle>Delete Request</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &ldquo;{deletingRequest?.title}&rdquo;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingRequest(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  )
}
