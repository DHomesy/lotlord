import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, IconButton, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import UpgradePromptDialog from '../../components/common/UpgradePromptDialog'
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
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  // Unit wizard state — only shown after creating a multi/commercial property
  const [unitWizardPropertyId, setUnitWizardPropertyId] = useState(null)
  const [unitCount, setUnitCount] = useState(4)
  const [unitPrefix, setUnitPrefix] = useState('')
  const { data, isLoading } = useProperties()
  const { mutateAsync: create, isPending: isCreating } = useCreateProperty()
  const { mutateAsync: createUnit, isPending: isCreatingUnit } = useCreateUnit()

  const rows = Array.isArray(data) ? data : (data?.properties ?? data?.data ?? [])

  const handleCreate = async (values) => {
    try {
      const created = await create(values)
      setOpen(false)
      if (values.propertyType === 'single') {
        // Single-family: silently create the one default unit
        await createUnit({
          propertyId: created.id,
          unitNumber: '0',
          bedrooms: 0,
          bathrooms: 0,
          rentAmount: 0,
          status: 'vacant',
        })
      } else {
        // Multi-family or commercial: open unit wizard
        setUnitWizardPropertyId(created.id)
      }
    } catch (err) {
      if (err?.response?.status === 402) {
        setOpen(false)
        setUpgradeMessage(err.response.data?.error || 'You have reached the free plan property limit.')
        setUpgradeOpen(true)
      } else {
        throw err
      }
    }
  }

  const handleAddUnits = async () => {
    const prefix = unitPrefix.trim()
    const jobs = Array.from({ length: unitCount }, (_, i) => {
      const num = prefix ? `${prefix} ${i + 1}` : String(i + 1)
      return createUnit({
        propertyId: unitWizardPropertyId,
        unitNumber: num,
        bedrooms: 0,
        bathrooms: 0,
        rentAmount: 0,
        status: 'vacant',
      })
    })
    await Promise.all(jobs)
    setUnitWizardPropertyId(null)
    setUnitCount(4)
    setUnitPrefix('')
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

      {/* ── Unit wizard: shown after creating a multi/commercial property ── */}
      <Dialog
        open={!!unitWizardPropertyId}
        onClose={() => setUnitWizardPropertyId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add Units</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            How many units does this property have? You can always add more later.
          </DialogContentText>

          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" gutterBottom>Number of units</Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton
                  onClick={() => setUnitCount((n) => Math.max(1, n - 1))}
                  disabled={unitCount <= 1}
                >
                  <RemoveCircleOutlineIcon />
                </IconButton>
                <Typography variant="h5" sx={{ minWidth: 36, textAlign: 'center' }}>
                  {unitCount}
                </Typography>
                <IconButton onClick={() => setUnitCount((n) => Math.min(100, n + 1))}>
                  <AddCircleOutlineIcon />
                </IconButton>
              </Stack>
            </Box>

            <TextField
              label="Unit label prefix (optional)"
              placeholder="e.g. Apt, Unit, Suite"
              value={unitPrefix}
              onChange={(e) => setUnitPrefix(e.target.value)}
              helperText={`Creates: ${unitPrefix.trim() ? `${unitPrefix.trim()} 1` : '1'}, ${unitPrefix.trim() ? `${unitPrefix.trim()} 2` : '2'}…`}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnitWizardPropertyId(null)}>Skip for now</Button>
          <Button variant="contained" onClick={handleAddUnits} disabled={isCreatingUnit}>
            {isCreatingUnit ? 'Creating…' : `Create ${unitCount} Unit${unitCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      <UpgradePromptDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        message={upgradeMessage}
      />
    </PageContainer>
  )
}
