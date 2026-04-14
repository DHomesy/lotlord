import { Autocomplete, TextField, CircularProgress } from '@mui/material'
import { useTenants } from '../../hooks/useTenants'

/**
 * TenantPicker
 *
 * A searchable dropdown of all active tenants.
 * Designed to integrate with React Hook Form via the `Controller` wrapper.
 *
 * Props:
 *   value       – current UUID string (or null)
 *   onChange    – callback(uuidString | null)
 *   error       – boolean, drives red border
 *   helperText  – string, shown below field
 *   disabled    – bool, locks the field
 *   label       – optional override (default "Tenant")
 */
export default function TenantPicker({
  value,
  onChange,
  error,
  helperText,
  disabled = false,
  label = 'Tenant',
  includePending = false,
}) {
  const { data, isLoading } = useTenants(includePending ? { includePending: 'true' } : undefined)

  const options = (Array.isArray(data) ? data : (data?.tenants ?? data?.data ?? [])).map((t) => ({
    id: t.id,
    label: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || t.id,
  }))

  const selected = options.find((o) => o.id === value) ?? null

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, opt) => onChange(opt?.id ?? null)}
      loading={isLoading}
      disabled={disabled}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}
