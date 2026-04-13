import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, DialogTitle, DialogContent } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import PropertyForm from '../../components/forms/PropertyForm'
import { useProperties, useCreateProperty } from '../../hooks/useProperties'
import { useCreateUnit } from '../../hooks/useUnits'

const columns = [
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 150 },
  {
    field: 'address_line1',
    headerName: 'Address',
    flex: 1.5,
    minWidth: 200,
    valueGetter: (value, row) => {
      const line1 = row.address_line1 || row.addressLine1 || ''
      const line2 = row.address_line2 || row.addressLine2 || ''
      return [line1, line2].filter(Boolean).join(' ')
    },
  },
  { field: 'city', headerName: 'City', width: 120 },
  { field: 'state', headerName: 'State', width: 80 },
  { field: 'property_type', headerName: 'Type', width: 120 },
]

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useProperties()
  const { mutateAsync: create, isPending: isCreating } = useCreateProperty()
  const { mutateAsync: createUnit, isPending: isCreatingUnit } = useCreateUnit()

  const rows = Array.isArray(data) ? data : (data?.properties ?? data?.data ?? [])

  const handleCreate = async (values) => {
    const created = await create(values)
    if (values.propertyType === 'single') {
      await createUnit({
        propertyId: created.id,
        unitNumber: '0',
        bedrooms: 0,
        bathrooms: 0,
        rentAmount: 0,
        status: 'vacant',
      })
    }
    setOpen(false)
  }

  return (
    <PageContainer
      title="Properties"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          New Property
        </Button>
      }
    >
      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No properties yet. Add your first property to get started."
          onAdd={() => setOpen(true)}
          addLabel="Add Property"
        />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          onRowClick={(params) => navigate(`/properties/${params.id}`)}
          sx={{ cursor: 'pointer' }}
        />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Property</DialogTitle>
        <DialogContent>
          <PropertyForm onSubmit={handleCreate} loading={isCreating || isCreatingUnit} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
