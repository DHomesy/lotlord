import { Autocomplete, TextField, CircularProgress } from '@mui/material'
import { useUnits } from '../../hooks/useUnits'

/**
 * UnitPicker
 *
 * A searchable dropdown that lists all units with a human-readable label.
 * Designed to integrate with React Hook Form via the `Controller` wrapper.
 *
 * Props:
 *   value       – current UUID string (or null)
 *   onChange    – callback(uuidString | null)
 *   error       – boolean, drives red border
 *   helperText  – string, shown below field
 *   disabled    – bool, locks the field (used when unit is pre-filled for tenant)
 *   label       – optional override for field label (default "Unit")
 *   params      – optional query params forwarded to useUnits (e.g. { status: 'vacant' })
 */
export default function UnitPicker({
  value,
  onChange,
  error,
  helperText,
  disabled = false,
  label = 'Unit',
  params,
}) {
  const { data, isLoading } = useUnits(params)

  const options = (Array.isArray(data) ? data : []).map((u) => ({
    id: u.id,
    label: [u.property_address || u.property_name, u.unit_number ? `Unit ${u.unit_number}` : null]
      .filter(Boolean)
      .join(' — '),
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
