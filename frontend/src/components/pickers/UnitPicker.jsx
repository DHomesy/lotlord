import { Autocomplete, TextField, CircularProgress } from '@mui/material'
import { useUnits } from '../../hooks/useUnits'

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

  const hasNoUnits = !isLoading && options.length === 0
  const isDisabled = disabled || hasNoUnits
  const resolvedHelperText = hasNoUnits
    ? 'No units yet — add a property and units first'
    : helperText

  const selected = options.find((o) => o.id === value) ?? null

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, opt) => onChange(opt?.id ?? null)}
      loading={isLoading}
      disabled={isDisabled}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(inputParams) => (
        <TextField
          {...inputParams}
          label={label}
          error={error && !hasNoUnits}
          helperText={resolvedHelperText}
          InputProps={{
            ...inputParams.InputProps,
            endAdornment: (
              <>
                {isLoading ? <CircularProgress color="inherit" size={16} /> : null}
                {inputParams.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}
