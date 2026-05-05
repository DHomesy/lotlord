import { useState, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Chip, CircularProgress, Divider,
  Drawer, IconButton, LinearProgress, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import EditIcon from '@mui/icons-material/Edit'
import PaymentsIcon from '@mui/icons-material/Payments'
import BlockIcon from '@mui/icons-material/Block'
import StatusChip from '../common/StatusChip'
import { usePayments, useRecordManualPayment } from '../../hooks/usePayments'
import { useUpdateCharge, useVoidCharge } from '../../hooks/useCharges'
import { useAuthStore } from '../../store/authStore'

const TYPE_LABELS = {
  rent: 'Rent', late_fee: 'Late Fee', utility: 'Utility',
  maintenance: 'Maintenance', other: 'Other',
}

const METHOD_LABELS = {
  cash: 'Cash', check: 'Cheque', zelle: 'Zelle', other: 'Other',
  stripe_ach: 'ACH Bank Transfer', stripe_card: 'Card',
}

// ── Record Payment Form ───────────────────────────────────────────────────────

const recordSchema = z.object({
  amountPaid:    z.coerce.number().positive('Amount must be positive'),
  paymentDate:   z.string().min(1, 'Date is required'),
  paymentMethod: z.enum(['cash', 'check', 'zelle', 'other']),
  notes:         z.string().optional(),
})

function RecordPaymentForm({ charge, onSuccess }) {
  const { mutate, isPending, error, reset: resetMutation } = useRecordManualPayment()
  const { register, handleSubmit, control, formState: { errors }, reset: resetForm } = useForm({
    resolver: zodResolver(recordSchema),
    defaultValues: { amountPaid: '', paymentDate: '', paymentMethod: 'cash', notes: '' },
  })

  useEffect(() => {
    if (charge) {
      const remaining = charge.total_paid != null
        ? Math.max(0, parseFloat(charge.amount) - parseFloat(charge.total_paid))
        : parseFloat(charge.amount)
      resetForm({
        amountPaid: String(remaining),
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'cash',
        notes: '',
      })
      resetMutation()
    }
  }, [charge?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values) {
    mutate(
      {
        leaseId:       charge.lease_id,
        chargeId:      charge.id,
        amountPaid:    values.amountPaid,
        paymentDate:   values.paymentDate,
        paymentMethod: values.paymentMethod,
        notes:         values.notes || undefined,
      },
      { onSuccess },
    )
  }

  const remaining = charge
    ? Math.max(0, parseFloat(charge.amount) - parseFloat(charge.total_paid ?? 0))
    : 0

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit(onSubmit)}>
      {charge?.status === 'pending' && (
        <Alert severity="warning">
          A bank transfer is already in progress. If it also settles you may need to issue a
          refund or credit.
        </Alert>
      )}
      <TextField
        label={`Amount paid ($) — max $${remaining.toLocaleString()}`}
        type="number"
        size="small"
        inputProps={{ step: '0.01', min: '0.01', max: String(remaining) }}
        {...register('amountPaid')}
        error={!!errors.amountPaid}
        helperText={errors.amountPaid?.message}
      />
      <TextField
        label="Payment date"
        type="date"
        size="small"
        InputLabelProps={{ shrink: true }}
        {...register('paymentDate')}
        error={!!errors.paymentDate}
        helperText={errors.paymentDate?.message}
      />
      <Controller
        name="paymentMethod"
        control={control}
        render={({ field }) => (
          <TextField label="Method" select size="small" {...field} error={!!errors.paymentMethod}>
            {['cash', 'check', 'zelle', 'other'].map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField label="Notes (optional)" multiline rows={2} size="small" {...register('notes')} />
      {error && (
        <Alert severity="error">
          {error.response?.data?.error ?? 'Failed to record payment. Please try again.'}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={isPending}
        startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <PaymentsIcon />}
      >
        {isPending ? 'Saving…' : 'Record Payment'}
      </Button>
    </Stack>
  )
}

// ── Edit Charge Form ──────────────────────────────────────────────────────────

const editSchema = z.object({
  chargeType:  z.enum(['rent', 'late_fee', 'utility', 'maintenance', 'other']),
  dueDate:     z.string().min(1, 'Due date is required'),
  description: z.string().optional(),
})

function EditChargeForm({ charge, onSuccess }) {
  const { mutate, isPending, error, reset: resetMutation } = useUpdateCharge()
  const { register, handleSubmit, control, formState: { errors }, reset: resetForm } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      chargeType:  charge?.charge_type ?? 'rent',
      dueDate:     charge?.due_date?.slice(0, 10) ?? '',
      description: charge?.description ?? '',
    },
  })

  useEffect(() => {
    if (charge) {
      resetForm({
        chargeType:  charge.charge_type ?? 'rent',
        dueDate:     charge.due_date?.slice(0, 10) ?? '',
        description: charge.description ?? '',
      })
      resetMutation()
    }
  }, [charge?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values) {
    mutate(
      { id: charge.id, chargeType: values.chargeType, dueDate: values.dueDate, description: values.description },
      { onSuccess },
    )
  }

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="chargeType"
        control={control}
        render={({ field }) => (
          <TextField label="Type" select size="small" {...field} error={!!errors.chargeType}>
            {['rent', 'late_fee', 'utility', 'maintenance', 'other'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField
        label="Due date"
        type="date"
        size="small"
        InputLabelProps={{ shrink: true }}
        {...register('dueDate')}
        error={!!errors.dueDate}
        helperText={errors.dueDate?.message}
      />
      <TextField label="Description" size="small" {...register('description')} />
      {error && (
        <Alert severity="error">
          {error.response?.data?.error ?? 'Failed to update charge. Please try again.'}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={isPending}
        startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <EditIcon />}
      >
        {isPending ? 'Saving…' : 'Save Changes'}
      </Button>
    </Stack>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

/**
 * ChargeDetailDrawer — admin/landlord/employee CRUD hub for a single charge.
 *
 * Mobile-first: full-width on xs, 520px side panel on sm+.
 * Sections rendered via Accordion so each is independently collapsible:
 *   • Amount breakdown (always shown)
 *   • Payment History (when partial/paid/pending)
 *   • Record Manual Payment (when unpaid/partial/pending + lease linked)
 *   • Edit Charge (when charge is editable)
 *   • Void Charge danger zone (landlord only, when charge can be voided)
 *
 * Props:
 *   charge  – charge row object (null = drawer closed)
 *   onClose – () => void
 */
export default function ChargeDetailDrawer({ charge, onClose }) {
  const user = useAuthStore((s) => s.user)
  const role = user?.role

  const [voidConfirm, setVoidConfirm] = useState(false)

  // Reset void confirmation whenever the drawer closes or a different charge opens
  useEffect(() => { if (!charge) setVoidConfirm(false) }, [charge])

  const { data: payments = [], isLoading: loadingPayments } = usePayments(
    charge?.lease_id ? { leaseId: charge.lease_id, chargeId: charge.id } : undefined,
  )

  const { mutate: doVoid, isPending: voiding } = useVoidCharge()

  if (!charge) return null

  const full      = Number(charge.amount ?? 0)
  const paid      = Number(charge.total_paid ?? 0)
  const remaining = Math.max(0, full - paid)
  const pct       = full > 0 ? Math.min(100, Math.round((paid / full) * 100)) : 0

  const canRecord = (
    (charge.status === 'unpaid' || charge.status === 'partial' || charge.status === 'pending')
    && !!charge.lease_id
  )
  const canEdit = charge.status !== 'voided' && charge.status !== 'paid'
  // Landlords and admins can void; employees cannot. Partial charges cannot be voided.
  const canVoid = (role === 'landlord' || role === 'admin')
    && charge.status !== 'voided'
    && charge.status !== 'paid'
    && charge.status !== 'partial'

  const hasHistory = loadingPayments || payments.length > 0

  let barColor = 'warning'
  if (charge.status === 'paid')    barColor = 'success'
  if (charge.status === 'pending') barColor = 'info'

  const accordionSx = { '&:before': { display: 'none' } }

  return (
    <Drawer
      anchor="right"
      open={!!charge}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, display: 'flex', flexDirection: 'column' } }}
    >
      {/* ── Sticky header ── */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1.5,
          borderBottom: 1, borderColor: 'divider',
          position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper',
        }}
      >
        <IconButton size="small" edge="start" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {TYPE_LABELS[charge.charge_type] ?? charge.charge_type}
          </Typography>
          {(charge.unit_number || charge.property_name) && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {[charge.unit_number && `Unit ${charge.unit_number}`, charge.property_name]
                .filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
        <StatusChip status={charge.status} />
      </Box>

      {/* ── Scrollable body ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 4 }}>

        {/* Amount breakdown card */}
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1.5 }}
            >
              Amount
            </Typography>
            <Stack spacing={0.75}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Total charged</Typography>
                <Typography variant="body2" fontWeight={600}>
                  ${full.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
              </Stack>
              {paid > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Paid</Typography>
                  <Typography variant="body2" color="success.main" fontWeight={500}>
                    ${paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Stack>
              )}
              {remaining > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Balance due</Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={600}>
                    ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Stack>
              )}
            </Stack>
            {paid > 0 && (
              <>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  color={barColor}
                  sx={{ height: 5, borderRadius: 3, mt: 1.5, mb: 0.5 }}
                />
                <Typography variant="caption" color="text.disabled">{pct}% paid</Typography>
              </>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Due {charge.due_date?.slice(0, 10)}
            {charge.description ? ` · ${charge.description}` : ''}
          </Typography>
        </Box>

        <Divider />

        {/* Payment History — shown when there are or may be payments */}
        {(hasHistory || charge.status === 'paid') && (
          <Accordion
            defaultExpanded={charge.status === 'paid' || charge.status === 'partial'}
            disableGutters
            elevation={0}
            sx={accordionSx}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2">Payment History</Typography>
                {payments.length > 0 && (
                  <Chip label={payments.length} size="small" />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0 }}>
              {loadingPayments ? (
                <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
              ) : payments.length === 0 ? (
                <Typography variant="body2" color="text.disabled">No payments recorded yet.</Typography>
              ) : (
                <Stack spacing={0} divider={<Divider />}>
                  {payments.map((p) => {
                    const feeDollars = p.stripe_fee_cents > 0 ? p.stripe_fee_cents / 100 : null
                    return (
                      <Stack
                        key={p.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        sx={{ py: 1.25 }}
                      >
                        <Box>
                          <Typography variant="body2">{p.payment_date?.slice(0, 10)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                          </Typography>
                          {p.notes && (
                            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                              {p.notes}
                            </Typography>
                          )}
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.25}>
                          <Typography variant="body2" fontWeight={600}>
                            ${parseFloat(p.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                          {feeDollars != null && (
                            <Tooltip
                              title="ACH processing fee paid by the tenant. You receive the full rent amount."
                              arrow
                            >
                              <Typography variant="caption" color="text.disabled" sx={{ cursor: 'help' }}>
                                +${feeDollars.toFixed(2)} ACH fee
                              </Typography>
                            </Tooltip>
                          )}
                          <Chip
                            label={p.status}
                            size="small"
                            color={
                              p.status === 'completed' ? 'success'
                              : p.status === 'pending'   ? 'info'
                              : 'default'
                            }
                            variant="outlined"
                          />
                        </Stack>
                      </Stack>
                    )
                  })}
                </Stack>
              )}
            </AccordionDetails>
          </Accordion>
        )}

        {canRecord && <Divider />}

        {/* Record Manual Payment */}
        {canRecord && (
          <Accordion
            defaultExpanded={charge.status === 'unpaid' || charge.status === 'partial'}
            disableGutters
            elevation={0}
            sx={accordionSx}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
              <Typography variant="subtitle2">Record Manual Payment</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0 }}>
              <RecordPaymentForm charge={charge} onSuccess={onClose} />
            </AccordionDetails>
          </Accordion>
        )}

        {canEdit && <Divider />}

        {/* Edit Charge */}
        {canEdit && (
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
              <Typography variant="subtitle2">Edit Charge</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0 }}>
              <EditChargeForm charge={charge} onSuccess={onClose} />
            </AccordionDetails>
          </Accordion>
        )}

        {/* Void — landlord only, danger zone */}
        {canVoid && (
          <>
            <Divider sx={{ mt: 1 }} />
            <Box sx={{ px: 2, py: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1.5 }}
              >
                Danger Zone
              </Typography>
              {!voidConfirm ? (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<BlockIcon />}
                  onClick={() => setVoidConfirm(true)}
                >
                  Void this charge
                </Button>
              ) : (
                <Box sx={{ border: 1, borderColor: 'error.main', borderRadius: 1, p: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    Void the <strong>{TYPE_LABELS[charge.charge_type]}</strong> charge of{' '}
                    <strong>${full.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
                    due <strong>{charge.due_date?.slice(0, 10)}</strong>?
                    {charge.lease_id && " A credit entry will reverse the tenant's ledger balance."}
                  </Typography>
                  <Typography variant="caption" color="error.main">
                    This cannot be undone.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button size="small" onClick={() => setVoidConfirm(false)} disabled={voiding}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      disabled={voiding}
                      startIcon={voiding ? <CircularProgress size={12} color="inherit" /> : null}
                      onClick={() => doVoid(charge.id, { onSuccess: onClose })}
                    >
                      {voiding ? 'Voiding…' : 'Confirm Void'}
                    </Button>
                  </Stack>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  )
}


const METHOD_LABELS = {
  stripe_ach:  'ACH Bank Transfer',
  stripe_card: 'Card',
  cash:        'Cash',
  check:       'Cheque',
  zelle:       'Zelle',
  other:       'Other',
}

const TYPE_LABELS = {
  rent:        'Rent',
  late_fee:    'Late Fee',
  utility:     'Utility',
  maintenance: 'Maintenance',
  other:       'Other',
}

function downloadReceipt(paymentId) {
  api.getReceipt(paymentId).then((blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${paymentId.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })
}

/**
 * ChargeDetailDrawer
 *
 * Right-side drawer showing full accounting for a single charge.
 * Works for both tenant and admin views.
 *
 * Props:
 *   charge   – the charge row (null = closed)
 *   onClose  – () => void
 *   onPay    – optional () => void — if provided, a "Pay Now" button appears (tenant)
 */
export default function ChargeDetailDrawer({ charge, onClose, onPay }) {
  const { data: payments = [], isLoading } = usePayments(
    charge ? { leaseId: charge.lease_id, chargeId: charge.id } : undefined,
  )

  if (!charge) return null

  const full      = Number(charge.amount ?? 0)
  const paid      = Number(charge.total_paid ?? 0)
  const remaining = Math.max(0, full - paid)
  const pct       = full > 0 ? Math.min(100, Math.round((paid / full) * 100)) : 0

  const canPay = onPay && (charge.status === 'unpaid' || charge.status === 'partial')

  let barColor = 'inherit'
  if (charge.status === 'paid')    barColor = 'success'
  else if (charge.status === 'partial') barColor = 'warning'
  else if (charge.status === 'pending') barColor = 'info'

  return (
    <Drawer
      anchor="right"
      open={!!charge}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 0 } }}
    >
      {/* ── Header ── */}
      <Box sx={{ px: 3, pt: 3, pb: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
            {TYPE_LABELS[charge.charge_type] ?? charge.charge_type}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {charge.description || 'No description'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ px: 3, py: 2, overflowY: 'auto', flex: 1 }}>

        {/* ── Status + Due Date ── */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
          <StatusChip status={charge.status} />
          <Typography variant="body2" color="text.secondary">
            Due {charge.due_date?.slice(0, 10)}
          </Typography>
        </Stack>

        {/* ── Amount breakdown card ── */}
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            mb: 3,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Amount breakdown
          </Typography>

          <Stack spacing={0.75}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Total charged</Typography>
              <Typography variant="body2" fontWeight={600}>
                ${full.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Paid so far</Typography>
              <Typography variant="body2" color={paid > 0 ? 'success.main' : 'text.disabled'} fontWeight={paid > 0 ? 600 : 400}>
                ${paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
            {charge.status !== 'paid' && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Remaining</Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={remaining > 0 ? 'warning.main' : 'success.main'}
                >
                  ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
              </Stack>
            )}
          </Stack>

          {(charge.status === 'partial' || charge.status === 'paid' || charge.status === 'pending') && (
            <>
              <LinearProgress
                variant="determinate"
                value={pct}
                color={barColor}
                sx={{ height: 6, borderRadius: 3, mt: 1.5, mb: 0.5 }}
              />
              <Typography variant="caption" color="text.disabled">
                {pct}% paid
              </Typography>
            </>
          )}
        </Box>

        {/* ── Pending notice ── */}
        {charge.status === 'pending' && (
          <Box sx={{ mb: 2.5, p: 1.5, bgcolor: 'info.50', borderRadius: 1, border: 1, borderColor: 'info.200' }}>
            <Typography variant="body2" color="info.main">
              A bank transfer is in progress. It typically settles in 1–3 business days.
              No further action is needed.
            </Typography>
          </Box>
        )}

        {/* ── Pay Now button (tenant only) ── */}
        {canPay && (
          <Button
            variant="contained"
            fullWidth
            sx={{ mb: 3 }}
            onClick={() => { onClose(); onPay(charge) }}
          >
            Pay ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })} remaining
          </Button>
        )}

        <Divider sx={{ mb: 2.5 }} />

        {/* ── Payment timeline ── */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Payment history
        </Typography>

        {isLoading ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : payments.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No payments recorded yet.
          </Typography>
        ) : (
          <Stack spacing={0} divider={<Divider />}>
            {payments.map((p) => {
              const feeDollars = p.stripe_fee_cents > 0 ? p.stripe_fee_cents / 100 : null
              const tenantTotal = feeDollars != null
                ? parseFloat(p.amount_paid) + feeDollars
                : null
              return (
                <Stack
                  key={p.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  sx={{ py: 1.5 }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {p.payment_date?.slice(0, 10)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                    </Typography>
                    {p.notes && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                        {p.notes}
                      </Typography>
                    )}
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.25}>
                    <Typography variant="body2" fontWeight={600}>
                      ${parseFloat(p.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Typography>
                    {feeDollars != null && (
                      <Tooltip title="ACH processing fee paid by tenant. You received the full rent amount." arrow>
                        <Typography variant="caption" color="text.disabled" sx={{ cursor: 'help' }}>
                          +${feeDollars.toFixed(2)} ACH fee
                        </Typography>
                      </Tooltip>
                    )}
                    {tenantTotal != null && (
                      <Typography variant="caption" color="text.secondary">
                        Tenant total: ${tenantTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    )}
                    <Chip
                      label={p.status}
                      size="small"
                      color={p.status === 'completed' ? 'success' : p.status === 'pending' ? 'info' : 'default'}
                      variant="outlined"
                    />
                    <Tooltip title="Download receipt">
                      <IconButton size="small" onClick={() => downloadReceipt(p.id)} sx={{ mt: 0.25 }}>
                        <ReceiptIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              )
            })}
          </Stack>
        )}
      </Box>
    </Drawer>
  )
}
