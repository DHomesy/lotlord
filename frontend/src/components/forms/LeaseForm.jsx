import { useState, useMemo } from 'react'
import { Controller, useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  TextField, Stack, Button, MenuItem, Divider, Typography,
  Grid, Chip, InputAdornment, Collapse, FormControlLabel, Switch,
  Checkbox, Paper, Alert, IconButton,
} from '@mui/material'
import PersonIcon      from '@mui/icons-material/Person'
import EventIcon       from '@mui/icons-material/Event'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import GavelIcon       from '@mui/icons-material/Gavel'
import BoltIcon        from '@mui/icons-material/Bolt'
import AddIcon         from '@mui/icons-material/Add'
import DeleteIcon      from '@mui/icons-material/Delete'
import UnitPicker   from '../pickers/UnitPicker'
import TenantPicker from '../pickers/TenantPicker'

const STATUSES = ['active', 'pending', 'expired', 'terminated']

const schema = z.object({
  tenant_id:              z.string().uuid('Tenant is required'),
  unit_id:                z.string().uuid('Unit is required'),
  start_date:             z.string().min(1, 'Start date is required'),
  end_date:               z.string().min(1, 'End date is required'),
  rent_amount:            z.coerce.number().positive('Rent must be positive'),
  deposit_amount:         z.coerce.number().min(0).default(0),
  late_fee_amount:        z.coerce.number().min(0).default(0),
  late_fee_grace_days:    z.coerce.number().int().min(0).default(5),
  additional_fees:        z.array(
    z.object({
      description: z.string().min(1, 'Description required'),
      amount:      z.coerce.number().positive('Amount required'),
    }),
  ).default([]),
  auto_charges:           z.boolean().default(false),
  charge_due_day:         z.coerce.number().int().min(1).max(28).default(1),
  include_deposit_charge: z.boolean().default(false),
  status:                 z.enum(['active', 'pending', 'expired', 'terminated']).optional(),
})

/** Generates YYYY-MM-DD charge due-date strings for every month in [start, end]. */
function getChargeDueDates(start, end, dueDay = 1) {
  const day = Math.max(1, Math.min(28, Number(dueDay) || 1))
  if (!start || !end) return []
  // Parse as local time to avoid UTC-midnight rollback across month boundaries
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number)
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number)
  const s = new Date(sy, sm - 1, sd)
  const e = new Date(ey, em - 1, ed)
  if (isNaN(s) || isNaN(e) || e <= s) return []
  const dates = []
  const cur = new Date(s.getFullYear(), s.getMonth(), day)
  if (cur < s) cur.setMonth(cur.getMonth() + 1)
  while (cur <= e) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return dates
}

function ordinalSuffix(n) {
  const v = Number(n) % 100
  if (v >= 11 && v <= 13) return 'th'
  return { 1: 'st', 2: 'nd', 3: 'rd' }[Number(n) % 10] || 'th'
}

function fmtMonthYear(dateStr) {
  if (!dateStr) return ''
  const [y, m] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function calcDuration(start, end) {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s) || isNaN(e) || e <= s) return null
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (months < 1) {
    const days = Math.round((e - s) / 86_400_000)
    return `${days} day${days !== 1 ? 's' : ''}`
  }
  return `${months} month${months !== 1 ? 's' : ''}`
}

function SectionHeader({ icon, label, addon }) {
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {icon}
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {label}
        </Typography>
        {addon}
      </Stack>
      <Divider />
    </Stack>
  )
}

/**
 * LeaseForm
 *
 * Props:
 *   onSubmit          – callback(values) — includes auto_charges, charge_due_day, include_deposit_charge
 *   defaultValues     – initial form state
 *   loading           – disables submit button while saving
 *   isEdit            – shows status field and locks tenant/unit/start date; hides Charge Schedule
 *   hideTenantPicker  – hides TenantPicker (use when tenant is pre-known; pass tenant_id via defaultValues)
 *   hideUnitPicker    – hides UnitPicker (use when unit is pre-known; pass unit_id via defaultValues)
 *   tenantLabel       – display name shown in read-only Tenant field (edit mode)
 *   unitLabel         – display name shown in read-only Unit field (edit mode)
 */
export default function LeaseForm({
  onSubmit,
  defaultValues,
  loading,
  isEdit = false,
  hideTenantPicker = false,
  hideUnitPicker = false,
  tenantLabel = '',
  unitLabel = '',
}) {
  const [showLateFees, setShowLateFees] = useState(
    !!(defaultValues?.late_fee_amount && Number(defaultValues.late_fee_amount) > 0),
  )

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      deposit_amount:         0,
      late_fee_amount:        0,
      late_fee_grace_days:    5,
      additional_fees:        [],
      auto_charges:           false,
      charge_due_day:         1,
      include_deposit_charge: false,
      ...defaultValues,
    },
  })

  const { fields: feeFields, append: appendFee, remove: removeFee } = useFieldArray({
    control,
    name: 'additional_fees',
  })

  const startDate      = watch('start_date')
  const endDate        = watch('end_date')
  const rentAmount     = watch('rent_amount')
  const depositAmount  = watch('deposit_amount')
  const autoCharges    = watch('auto_charges')
  const chargeDueDay   = watch('charge_due_day')
  const inclDeposit    = watch('include_deposit_charge')
  const additionalFees = watch('additional_fees')

  const duration     = calcDuration(startDate, endDate)
  const previewDates = useMemo(
    () => (autoCharges ? getChargeDueDates(startDate, endDate, chargeDueDay) : []),
    [autoCharges, startDate, endDate, chargeDueDay],
  )
  const rentTotal       = previewDates.length * (Number(rentAmount) || 0)
  const additionalTotal = previewDates.length * (additionalFees?.reduce((sum, f) => sum + (Number(f.amount) || 0), 0) || 0)

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={3} sx={{ pt: 1 }}>

      {/* ── Parties ── */}
      <SectionHeader
        icon={<PersonIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        label="Parties"
      />

      {!hideTenantPicker && (
        isEdit ? (
          <TextField
            label="Tenant"
            value={tenantLabel}
            fullWidth
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
                includePending
              />
            )}
          />
        )
      )}

      {isEdit ? (
        <TextField
          label="Unit"
          value={unitLabel}
          fullWidth
          InputProps={{ readOnly: true }}
          helperText="Unit cannot be changed on an existing lease"
        />
      ) : hideUnitPicker ? null : (
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

      {/* ── Lease Term ── */}
      <SectionHeader
        icon={<EventIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        label="Lease Term"
        addon={
          duration ? (
            <Chip
              label={duration}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ ml: 'auto !important', height: 20, fontSize: 11, fontWeight: 600 }}
            />
          ) : null
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Start Date"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            disabled={isEdit}
            {...register('start_date')}
            error={!!errors.start_date}
            helperText={isEdit ? 'Locked — anchors all charges' : (errors.start_date?.message ?? ' ')}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="End Date"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            {...register('end_date')}
            error={!!errors.end_date}
            helperText={errors.end_date?.message ?? ' '}
          />
        </Grid>
      </Grid>

      {/* ── Financials ── */}
      <SectionHeader
        icon={<AttachMoneyIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        label="Financials"
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Monthly Rent"
            type="number"
            fullWidth
            inputProps={{ min: 0, step: '0.01' }}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            {...register('rent_amount')}
            error={!!errors.rent_amount}
            helperText={errors.rent_amount?.message ?? ' '}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Security Deposit"
            type="number"
            fullWidth
            inputProps={{ min: 0, step: '0.01' }}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            {...register('deposit_amount')}
            error={!!errors.deposit_amount}
            helperText={errors.deposit_amount?.message ?? ' '}
          />
        </Grid>
      </Grid>

      {/* ── Additional Fees (create only) ── */}
      {!isEdit && (
        <>
          <SectionHeader
            icon={<AttachMoneyIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            label="Additional Fees"
            addon={
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => appendFee({ description: '', amount: '' })}
                sx={{ ml: 'auto !important' }}
              >
                Add Fee
              </Button>
            }
          />

          {feeFields.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              Optional — add recurring fees like water, electricity, parking, or pet fees.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {feeFields.map((field, idx) => (
                <Grid container spacing={1.5} alignItems="flex-start" key={field.id}>
                  <Grid item xs={7} sm={8}>
                    <TextField
                      label="Description"
                      placeholder="e.g. Water, Electricity, Parking"
                      fullWidth
                      size="small"
                      {...register(`additional_fees.${idx}.description`)}
                      error={!!errors.additional_fees?.[idx]?.description}
                      helperText={errors.additional_fees?.[idx]?.description?.message}
                    />
                  </Grid>
                  <Grid item xs={4} sm={3}>
                    <TextField
                      label="Amount / mo"
                      type="number"
                      fullWidth
                      size="small"
                      inputProps={{ min: 0, step: '0.01' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      {...register(`additional_fees.${idx}.amount`)}
                      error={!!errors.additional_fees?.[idx]?.amount}
                      helperText={errors.additional_fees?.[idx]?.amount?.message}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <IconButton size="small" color="error" onClick={() => removeFee(idx)} sx={{ mt: 0.5 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* ── Late Fees ── */}
      <SectionHeader
        icon={<GavelIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        label="Late Fees"
        addon={
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showLateFees}
                onChange={(e) => setShowLateFees(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                {showLateFees ? 'Enabled' : 'Off'}
              </Typography>
            }
            sx={{ ml: 'auto !important', mr: 0 }}
          />
        }
      />

      <Collapse in={showLateFees} unmountOnExit>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Late Fee Amount"
              type="number"
              fullWidth
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              {...register('late_fee_amount')}
              error={!!errors.late_fee_amount}
              helperText="Charged once the grace period expires"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Grace Period"
              type="number"
              fullWidth
              inputProps={{ min: 0, step: 1 }}
              InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
              {...register('late_fee_grace_days')}
              error={!!errors.late_fee_grace_days}
              helperText="Days after due date before fee applies"
            />
          </Grid>
        </Grid>
      </Collapse>

      {/* ── Charge Schedule (create only) ── */}
      {!isEdit && (
        <>
          <SectionHeader
            icon={<BoltIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            label="Charge Schedule"
            addon={
              <Controller
                name="auto_charges"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="caption" color="text.secondary">
                        {field.value ? 'On' : 'Off'}
                      </Typography>
                    }
                    sx={{ ml: 'auto !important', mr: 0 }}
                  />
                )}
              />
            }
          />

          <Collapse in={!!autoCharges} unmountOnExit>
            <Stack spacing={2}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="include_deposit_charge"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={!!field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                          />
                        }
                        label={<Typography variant="body2">Include deposit charge on start date</Typography>}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Due Day of Month"
                    type="number"
                    fullWidth
                    inputProps={{ min: 1, max: 28 }}
                    {...register('charge_due_day')}
                    error={!!errors.charge_due_day}
                    helperText="Day each monthly charge is due (1–28)"
                  />
                </Grid>
              </Grid>

              {/* Live preview */}
              {previewDates.length > 0 ? (
                <Paper variant="outlined" sx={{ p: 2, borderColor: 'primary.main' }}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      {previewDates.length} rent charge{previewDates.length !== 1 ? 's' : ''}
                      {rentTotal > 0
                        ? ` × $${Number(rentAmount).toLocaleString()} = $${rentTotal.toLocaleString()} total`
                        : ''}
                    </Typography>
                    {additionalFees?.filter((f) => f.description && Number(f.amount) > 0).map((f, i) => (
                      <Typography key={i} variant="caption" color="text.secondary">
                        + {previewDates.length} × {f.description} @ ${Number(f.amount).toLocaleString()} = ${(previewDates.length * Number(f.amount)).toLocaleString()}
                      </Typography>
                    ))}
                    {additionalTotal > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Total incl. fees: ${(rentTotal + additionalTotal).toLocaleString()}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Due on the {chargeDueDay}{ordinalSuffix(chargeDueDay)} of each month —{' '}
                      {fmtMonthYear(previewDates[0])} to {fmtMonthYear(previewDates[previewDates.length - 1])}
                    </Typography>
                    {inclDeposit && Number(depositAmount) > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        + 1 deposit charge of ${Number(depositAmount).toLocaleString()} on {startDate}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              ) : (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Set valid start and end dates above to preview the charge schedule.
                </Alert>
              )}
            </Stack>
          </Collapse>
        </>
      )}

      {/* ── Status (edit only) ── */}
      {isEdit && (
        <>
          <SectionHeader label="Status" />
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <TextField label="Status" select fullWidth {...field} value={field.value ?? ''}>
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </>
      )}

      <Button type="submit" variant="contained" size="large" disabled={loading}>
        {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Lease'}
      </Button>
    </Stack>
  )
}
