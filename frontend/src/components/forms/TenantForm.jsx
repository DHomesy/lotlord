import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button } from '@mui/material'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
})

export default function TenantForm({ onSubmit, defaultValues, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <TextField label="First Name" {...register('firstName')} error={!!errors.firstName} helperText={errors.firstName?.message} />
      <TextField label="Last Name" {...register('lastName')} error={!!errors.lastName} helperText={errors.lastName?.message} />
      <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
      <TextField label="Phone" {...register('phone')} />
      <TextField 
        label="Initial Password (optional)" 
        type="password" 
        {...register('password')} 
        error={!!errors.password} 
        helperText={errors.password?.message || 'Leave blank to use default: ChangeMe123!'}
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )
}
