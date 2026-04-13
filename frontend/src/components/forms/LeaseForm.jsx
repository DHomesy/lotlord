import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, MenuItem } from '@mui/material'
import UnitPicker from '../pickers/UnitPicker'
import TenantPicker from '../pickers/TenantPicker'

const STATUSES = ['active', 'pending', 'expired', 'terminated']

const schema = z.object({
  tenant_id: z.string().uuid('Tenant is required'),
  unit_id: z.string().uuid('Unit is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  rent_amount: z.coerce.number().positive('Rent must be positive'),
  deposit_amount: z.coerce.number().min(0).default(0),
  status: z.enum(['active', 'pending', 'expired', 'terminated']).optional(),
})

/**
 * LeaseForm
 *
 * Props:
 *   onSubmit          – callback(values)
 *   defaultValues     – initial form state
 *   loading           – disables submit button while saving
 *   isEdit            – when true, shows status field and locks tenant/unit
 *   hideTenantPicker  – hides the TenantPicker (use when tenant is already known)
 *   tenantLabel       – display name shown in the read-only Tenant field (edit mode)
 *   unitLabel         – display name shown in the read-only Unit field (edit mode)
 */
export default function LeaseForm({
  onSubmit,
  defaultValues,
  loading,
  isEdit = false,
  hideTenantPicker = false,
  tenantLabel = '',
  unitLabel = '',
  children,
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      {!hideTenantPicker && (
        isEdit ? (
          <TextField
            label="Tenant"
            value={tenantLabel}
            InputProps={{ readOnly: true }}
            helperText="Tenant cannot be changed on an existing lease"
          />
        ) : (
          <Controller
            name="tenant_id"
            control={control}
            render={({ field }) => (
              <TenantPicker
                value={field.value ?? null}
                onChange={field.onChange}
                error={!!errors.tenant_id}
                helperText={errors.tenant_id?.message}
              />
            )}
          />
        )
      )}

      {isEdit ? (
        <TextField
          label="Unit"
          value={unitLabel}
          InputProps={{ readOnly: true }}
          helperText="Unit cannot be changed on an existing lease"
        />
      ) : (
        <Controller
          name="unit_id"
          control={control}
          render={({ field }) => (
            <UnitPicker
              value={field.value ?? null}
              onChange={field.onChange}
              error={!!errors.unit_id}
              helperText={errors.unit_id?.message}
            />
          )}
        />
      )}

      <TextField label="Start Date" type="date" InputLabelProps={{ shrink: true }} {...register('start_date')} error={!!errors.start_date} helperText={errors.start_date?.message} />
      <TextField label="End Date" type="date" InputLabelProps={{ shrink: true }} {...register('end_date')} error={!!errors.end_date} helperText={errors.end_date?.message} />
      <TextField label="Monthly Rent ($)" type="number" {...register('rent_amount')} error={!!errors.rent_amount} helperText={errors.rent_amount?.message} />
      <TextField label="Security Deposit ($)" type="number" {...register('deposit_amount')} />
      {isEdit && (
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <TextField label="Status" select {...field} value={field.value ?? ''}>
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
              ))}
            </TextField>
          )}
        />
      )}
      {children}
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : 'Save Changes'}
      </Button>
    </Stack>
  )
}
