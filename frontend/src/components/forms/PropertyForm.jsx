import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, MenuItem, Tooltip } from '@mui/material'
import { hasPortfolio } from '../../lib/plans'

const schema = z.object({
  name: z.string().min(1, 'Property nickname is required'),
  propertyType: z.enum(['single', 'multi', 'commercial']).default('single'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
})

export default function PropertyForm({ onSubmit, defaultValues, loading, subscription, userRole }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || { propertyType: 'single', country: 'US' },
  })

  const propertyType = useWatch({ control, name: 'propertyType', defaultValue: defaultValues?.propertyType || 'single' })
  const isSingleFamily = propertyType === 'single'
  const canUseCommercial = hasPortfolio(subscription) || userRole === 'admin'

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <TextField label="Type" select {...register('propertyType')} defaultValue={defaultValues?.propertyType || 'single'}>
        <MenuItem value="single">Single-family</MenuItem>
        <MenuItem value="multi">Multi-family</MenuItem>
        <Tooltip
          title={canUseCommercial ? '' : 'Requires the Portfolio plan ($79/mo)'}
          placement="right"
          disableHoverListener={canUseCommercial}
          disableFocusListener={canUseCommercial}
          disableTouchListener={canUseCommercial}
        >
          <span>
            <MenuItem value="commercial" disabled={!canUseCommercial}>
              Commercial{!canUseCommercial ? ' (Portfolio plan required)' : ''}
            </MenuItem>
          </span>
        </Tooltip>
      </TextField>
      <TextField
        label="Property Nickname"
        placeholder="e.g. Maple Apartments, Downtown Duplex"
        {...register('name')}
        error={!!errors.name}
        helperText={errors.name?.message || 'Internal name for your records only — tenants will see your property address, not this name.'}
      />
      <TextField label="Address Line 1" {...register('addressLine1')} error={!!errors.addressLine1} helperText={errors.addressLine1?.message} />
      {isSingleFamily && (
        <TextField label="Address Line 2" {...register('addressLine2')} helperText="Suite, apt, unit number, etc." />
      )}
      <TextField label="City" {...register('city')} />
      <TextField label="State" {...register('state')} />
      <TextField label="ZIP" {...register('zip')} />
      <TextField label="Country" {...register('country')} />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )
}
