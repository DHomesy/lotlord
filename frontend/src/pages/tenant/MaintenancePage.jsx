import { useState } from 'react'
import { Button, Dialog, DialogTitle, DialogContent, Alert, useTheme, useMediaQuery } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import MaintenanceForm from '../../components/forms/MaintenanceForm'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import EmptyState from '../../components/common/EmptyState'
import { useMaintenance, useCreateMaintenanceRequest } from '../../hooks/useMaintenance'
import { useMyLease } from '../../hooks/useTenants'
import * as maintenanceApi from '../../api/maintenance'

const columns = [
  { field: 'title', headerName: 'Title', flex: 1.5 },
  { field: 'unit_display', headerName: 'Unit', flex: 1, valueGetter: (v, row) => row.property_address ? `${row.property_address} - Unit ${row.unit_number}` : `Unit ${row.unit_number}` },
  { field: 'priority', headerName: 'Priority', width: 100 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'created_at', headerName: 'Submitted', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
]

export default function TenantMaintenancePage() {
  const [open, setOpen] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const { activeLease, isLoading: loadingLease } = useMyLease()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const { data, isLoading } = useMaintenance()
  const { mutate: create, isPending } = useCreateMaintenanceRequest()

  const rows = Array.isArray(data) ? data : (data?.requests ?? [])

  if (loadingLease) return <LoadingOverlay />

  async function handleSubmit(values, files) {
    setUploadError('')
    create(values, {
      onSuccess: async (newRequest) => {
        // Upload photos if any were selected
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
        setOpen(false)
      },
    })
  }

  return (
    <PageContainer
      title="My Maintenance Requests"
      actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setUploadError(''); setOpen(true) }}>New Request</Button>}
    >
      {!isLoading && rows.length === 0
        ? <EmptyState message="You haven't submitted any maintenance requests yet." />
        : <DataTable rows={rows} columns={columns} loading={isLoading} />
      }
      {uploadError && <Alert severity="warning" sx={{ mt: 2 }}>{uploadError}</Alert>}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Submit Maintenance Request</DialogTitle>
        <DialogContent>
          <MaintenanceForm
            lockedUnitId={activeLease?.unit_id}
            lockedUnitLabel={
              activeLease
                ? `${activeLease.address_line1} — Unit ${activeLease.unit_number}`
                : undefined
            }
            onSubmit={handleSubmit}
            loading={isPending}
            showPhotos
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
