import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, IconButton, Stack, TextField, Typography,
  useTheme, useMediaQuery,
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
import { useMySubscription } from '../../hooks/useBilling'
import { useAuthStore } from '../../store/authStore'

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
  const [unitWizardPropertyType, setUnitWizardPropertyType] = useState(null)
  const [unitCount, setUnitCount] = useState(4)
  const [unitPrefix, setUnitPrefix] = useState('')
  const [unitStartNumber, setUnitStartNumber] = useState(1)
  const { data, isLoading } = useProperties()
  const { mutateAsync: create, isPending: isCreating } = useCreateProperty()
  const { mutateAsync: createUnit, isPending: isCreatingUnit } = useCreateUnit()
  const { data: subscription } = useMySubscription()
  const user = useAuthStore((s) => s.user)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

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
        setUnitWizardPropertyType(values.propertyType)
        setUnitWizardPropertyId(created.id)
      }
    } catch (err) {
      if (err?.response?.status === 402) {
        setOpen(false)
        const code = err.response.data?.code
        const msg = err.response.data?.error
        if (code === 'COMMERCIAL_REQUIRED') {
          setUpgradeMessage(msg || 'Commercial properties require the Commercial plan ($79/mo).')
        } else {
          setUpgradeMessage(msg || 'You have reached the free plan property limit.')
        }
        setUpgradeOpen(true)
      } else {
        throw err
      }
    }
  }

  const handleAddUnits = async () => {
    const maxUnits = unitWizardPropertyType === 'multi' ? 4 : 100
    const clampedCount = Math.min(unitCount, maxUnits)
    const prefix = unitPrefix.trim()
    const start = Number(unitStartNumber) || 1
    const jobs = Array.from({ length: clampedCount }, (_, i) => {
      const num = prefix ? `${prefix} ${start + i}` : String(start + i)
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
    setUnitWizardPropertyType(null)
    setUnitCount(4)
    setUnitPrefix('')
    setUnitStartNumber(1)
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

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>New Property</DialogTitle>
        <DialogContent>
          <PropertyForm onSubmit={handleCreate} loading={isCreating || isCreatingUnit} subscription={subscription} userRole={user?.role} />
        </DialogContent>
      </Dialog>

      {/* ── Unit wizard: shown after creating a multi/commercial property ── */}
      <Dialog
        open={!!unitWizardPropertyId}
        onClose={() => setUnitWizardPropertyId(null)}
        maxWidth="xs"
        fullWidth
        fullScreen={isMobile}
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
                <IconButton
                  onClick={() => setUnitCount((n) => Math.min(unitWizardPropertyType === 'multi' ? 4 : 100, n + 1))}
                  disabled={unitWizardPropertyType === 'multi' && unitCount >= 4}
                >
                  <AddCircleOutlineIcon />
                </IconButton>
              </Stack>
            </Box>

            <TextField
              label="Unit label prefix (optional)"
              placeholder="e.g. Apt, Unit, Suite"
              value={unitPrefix}
              onChange={(e) => setUnitPrefix(e.target.value)}
              size="small"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Starting number"
                type="number"
                value={unitStartNumber}
                onChange={(e) => setUnitStartNumber(Math.max(0, Number(e.target.value)))}
                size="small"
                sx={{ width: 140 }}
                inputProps={{ min: 0 }}
              />
            </Stack>
            {(() => {
              const prefix = unitPrefix.trim()
              const start = Number(unitStartNumber) || 1
              const preview = Array.from({ length: Math.min(unitCount, 3) }, (_, i) =>
                prefix ? `${prefix} ${start + i}` : String(start + i)
              )
              const suffix = unitCount > 3 ? ` … ${prefix ? `${prefix} ${start + unitCount - 1}` : String(start + unitCount - 1)}` : ''
              return (
                <Typography variant="caption" color="text.secondary">
                  Creates: {preview.join(', ')}{suffix}
                </Typography>
              )
            })()}
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
