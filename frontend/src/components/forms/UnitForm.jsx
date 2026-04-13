import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, MenuItem, Alert } from '@mui/material'

const createSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required'),
  bedrooms: z.coerce.number().int().min(0).default(1),
  bathrooms: z.coerce.number().min(0).default(1),
  rentAmount: z.coerce.number().min(0, 'Rent must be 0 or more'),
  status: z.enum(['vacant', 'occupied', 'maintenance']).default('vacant'),
})

const editSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required'),
  bedrooms: z.coerce.number().int().min(0).default(1),
  bathrooms: z.coerce.number().min(0).default(1),
  rentAmount: z.coerce.number().min(0, 'Rent must be 0 or more'),
  status: z.enum(['vacant', 'maintenance']).optional(),
})

/**
 * UnitForm
 *
 * Props:
 *   onSubmit       – callback(values)
 *   defaultValues  – initial values (camelCase field names)
 *   loading        – disables submit while saving
 *   isEdit         – true when editing an existing unit
 */
export default function UnitForm({ onSubmit, defaultValues, loading, isEdit = false }) {
  const isOccupied = defaultValues?.status === 'occupied'

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: defaultValues || { bedrooms: 1, bathrooms: 1, status: 'vacant' },
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <TextField
        label="Unit Number"
        {...register('unitNumber')}
        error={!!errors.unitNumber}
        helperText={errors.unitNumber?.message}
        InputProps={{ readOnly: isEdit }}
        disabled={isEdit}
      />
      <Stack direction="row" spacing={2}>
        <TextField label="Bedrooms" type="number" {...register('bedrooms')} fullWidth />
        <TextField label="Bathrooms" type="number" {...register('bathrooms')} fullWidth />
      </Stack>
      <TextField
        label="Monthly Rent ($)"
        type="number"
        {...register('rentAmount')}
        error={!!errors.rentAmount}
        helperText={errors.rentAmount?.message}
      />
      {isEdit && isOccupied ? (
        <>
          <TextField
            label="Status"
            value="Occupied"
            disabled
            helperText="Terminate the active lease to vacate this unit"
            InputLabelProps={{ shrink: true }}
          />
          <Alert severity="info" sx={{ py: 0.5 }}>
            Rent amount, bedrooms, and bathrooms can still be updated — changes take effect on the next lease.
          </Alert>
        </>
      ) : (
        <TextField label="Status" select {...register('status')} defaultValue={defaultValues?.status || 'vacant'}>
          <MenuItem value="vacant">Vacant</MenuItem>
          <MenuItem value="maintenance">Maintenance</MenuItem>
          {!isEdit && <MenuItem value="occupied">Occupied</MenuItem>}
        </TextField>
      )}
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Save'}
      </Button>
    </Stack>
  )
}
