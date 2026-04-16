import { useState } from 'react'
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, Alert, IconButton, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import MaintenanceDetailDrawer from '../../components/maintenance/MaintenanceDetailDrawer'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import StatusChip from '../../components/common/StatusChip'
import MaintenanceForm from '../../components/forms/MaintenanceForm'
import {
  useMaintenance,
  useCreateMaintenanceRequest,
  useDeleteMaintenanceRequest,
} from '../../hooks/useMaintenance'
import * as maintenanceApi from '../../api/maintenance'

const CATEGORIES = ['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other']
const PRIORITIES = ['low', 'medium', 'high', 'emergency']

const columns = [
  { field: 'title', headerName: 'Title', flex: 1.5 },
  { field: 'unit_display', headerName: 'Unit', flex: 1, valueGetter: (v, row) => row.property_address ? `${row.property_address} - Unit ${row.unit_number}` : `Unit ${row.unit_number}` },
  { field: 'priority', headerName: 'Priority', width: 100 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'created_at', headerName: 'Submitted', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
]

export default function MaintenancePage() {
  const [createOpen, setCreateOpen]           = useState(false)
  const [uploadError, setUploadError]         = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [deletingRequest, setDeletingRequest] = useState(null)

  const { data, isLoading } = useMaintenance()
  const { mutate: create, isPending: creating } = useCreateMaintenanceRequest()
  const { mutate: remove, isPending: deleting } = useDeleteMaintenanceRequest()

  const rows = Array.isArray(data) ? data : (data?.requests ?? [])

  const handleRowClick = (params) => setSelectedRequest(params.row ?? params)

  async function handleCreate(values, files) {
    setUploadError('')
    create(values, {
      onSuccess: async (newRequest) => {
        if (files && files.length > 0) {
          const failed = []
          await Promise.all(
            files.map((file) =>
              maintenanceApi.uploadAttachment(newRequest.id, file).catch(() => {
                failed.push(file.name)
              }),
            ),
          )
          if (failed.length > 0) {
            setUploadError(`Request created, but failed to upload: ${failed.join(', ')}`)
          }
        }
        setCreateOpen(false)
      },
    })
  }

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
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setUploadError('') }} maxWidth="sm" fullWidth>
        <DialogTitle>New Request</DialogTitle>
        <DialogContent>
          {uploadError && <Alert severity="warning" sx={{ mb: 1 }}>{uploadError}</Alert>}
          <MaintenanceForm onSubmit={handleCreate} loading={creating} showPhotos />
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
