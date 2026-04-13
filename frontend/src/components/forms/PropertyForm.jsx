import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, MenuItem } from '@mui/material'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  propertyType: z.enum(['single', 'multi', 'commercial']).default('single'),
})

export default function PropertyForm({ onSubmit, defaultValues, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || { propertyType: 'single', country: 'US' },
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <TextField label="Name" {...register('name')} error={!!errors.name} helperText={errors.name?.message} />
      <TextField label="Address Line 1" {...register('addressLine1')} error={!!errors.addressLine1} helperText={errors.addressLine1?.message} />
      <TextField label="Address Line 2" {...register('addressLine2')} />
      <TextField label="City" {...register('city')} />
      <TextField label="State" {...register('state')} />
      <TextField label="ZIP" {...register('zip')} />
      <TextField label="Country" {...register('country')} />
      <TextField label="Type" select {...register('propertyType')} defaultValue={defaultValues?.propertyType || 'single'}>
        <MenuItem value="single">Single-family</MenuItem>
        <MenuItem value="multi">Multi-family</MenuItem>
        <MenuItem value="commercial">Commercial</MenuItem>
      </TextField>
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )
}
