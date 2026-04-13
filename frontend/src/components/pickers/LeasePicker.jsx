import { Autocomplete, TextField, CircularProgress } from '@mui/material'
import { useLeases } from '../../hooks/useLeases'

/**
 * LeasePicker
 *
 * A searchable dropdown of leases, labelled with tenant name + unit.
 * Designed to integrate with React Hook Form via the `Controller` wrapper.
 *
 * Props:
 *   value       – current UUID string (or null)
 *   onChange    – callback(uuidString | null)
 *   error       – boolean, drives red border
 *   helperText  – string, shown below field
 *   disabled    – bool, locks the field
 *   label       – optional override (default "Lease")
 *   onlyActive  – if true (default), only shows active leases
 */
export default function LeasePicker({
  value,
  onChange,
  error,
  helperText,
  disabled = false,
  label = 'Lease',
  onlyActive = true,
}) {
  const params = onlyActive ? { status: 'active' } : undefined
  const { data, isLoading } = useLeases(params)

  const leases = Array.isArray(data) ? data : (data?.leases ?? [])

  const options = leases.map((l) => {
    const tenant = [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
    const unit   = [l.property_name, l.unit_number ? `Unit ${l.unit_number}` : null]
      .filter(Boolean)
      .join(' — ')
    return {
      id: l.id,
      label: unit ? `${tenant} · ${unit}` : tenant,
    }
  })

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
