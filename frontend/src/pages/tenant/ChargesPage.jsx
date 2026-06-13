import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Tab, Tabs, Typography, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  RadioGroup, FormControlLabel, Radio, Alert, Stack, CircularProgress, Divider, Box,
  Paper, Tooltip, useTheme, useMediaQuery,
} from '@mui/material'
import PaymentIcon from '@mui/icons-material/Payment'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import ChargeAmountCell from '../../components/charges/ChargeAmountCell'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import { useCharges } from '../../hooks/useCharges'
import { usePayments } from '../../hooks/usePayments'
import { useMyLease } from '../../hooks/useTenants'
import { useMyPaymentMethods } from '../../hooks/useStripeSetup'
import { useCreateMyPaymentIntent } from '../../hooks/usePayments'

// ── PaymentDialog ─────────────────────────────────────────────────────────────
function PaymentDialog({ charge, open, onClose, fullScreen = false }) {
  const navigate = useNavigate()
  const { data: methods = [] } = useMyPaymentMethods()
  const [selectedId, setSelectedId] = useState('')
  const [amount, setAmount] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  const [feeResult, setFeeResult] = useState(null)
  const { mutate: pay, isPending, error, reset } = useCreateMyPaymentIntent()

  // Compute default amount: for partial charges use remaining balance; otherwise full charge
  function defaultAmount(c) {
    if (!c) return ''
    if (c.status === 'partial' && c.total_paid != null) {
      return String(Math.max(0, parseFloat(c.amount) - parseFloat(c.total_paid)))
    }
    return String(parseFloat(c.amount))
  }

  // Reset state whenever the dialog opens for a new charge
  useEffect(() => {
    if (open) {
      setSucceeded(false)
      setFeeResult(null)
      reset()
      setSelectedId(methods[0]?.id ?? '')
      setAmount(defaultAmount(charge))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, charge?.id])

  // Auto-select first verified method once they load
  useEffect(() => {
    if (methods.length > 0 && !selectedId) {
      const firstVerified = methods.find((m) => m.verified)
      setSelectedId(firstVerified?.id ?? methods[0].id)
    }
  }, [methods, selectedId])

  const parsedAmount = parseFloat(amount)
  // For partial charges use remaining balance as the ceiling; full amount otherwise
  const maxAmount = charge
    ? (charge.status === 'partial' && charge.total_paid != null
        ? Math.max(0, parseFloat(charge.amount) - parseFloat(charge.total_paid))
        : parseFloat(charge.amount))
    : 0
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxAmount

  function handlePay() {
    pay(
      { chargeId: charge.id, paymentMethodId: selectedId, amount: parsedAmount },
      { onSuccess: (data) => { setFeeResult(data); setSucceeded(true) } },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      {/* Guard against null charge during MUI close animation */}
      {!charge ? null : succeeded ? (
        <>
          <DialogTitle>Payment Initiated</DialogTitle>
          <DialogContent>
            <Alert severity="success">
              Your ACH bank transfer of{' '}
              <strong>${(feeResult?.totalAmountDollars ?? Number(parsedAmount || charge.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
              is processing.
              {feeResult?.feeCents > 0 && (
                <> This includes a <strong>${(feeResult.feeCents / 100).toFixed(2)}</strong> processing fee.
                </>)}
              {' '}It typically takes 1–3 business days to settle.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={onClose}>Done</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>Make a Payment</DialogTitle>
          <DialogContent>
            {methods.length === 0 ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                No bank account linked yet.{' '}
                <Button
                  size="small"
                  sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }}
                  onClick={() => { onClose(); navigate('/my/profile') }}
                >
                  Connect one on your Profile.
                </Button>
              </Alert>
            ) : (
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Amount ($) — max ${maxAmount.toLocaleString()}
                  </Typography>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={0.01}
                    max={maxAmount}
                    step={0.01}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 16,
                      border: '1px solid #ccc',
                      borderRadius: 4,
                    }}
                  />
                  {!amountValid && amount !== '' && (
                    <Typography variant="caption" color="error">
                      Enter an amount between $0.01 and ${maxAmount.toLocaleString()}.
                    </Typography>
                  )}
                  {amountValid && (() => {
                    const feeDollars = Math.min(Math.round(parsedAmount * 100 * 0.008), 500) / 100
                    const totalDollars = parsedAmount + feeDollars
                    return (
                      <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">Rent / charge amount</Typography>
                          <Typography variant="caption">${parsedAmount.toFixed(2)}</Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                          <Tooltip title="ACH bank transfer processing fee (0.8%, max $5.00) charged by our payment processor." arrow>
                            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                              Processing fee (ACH)
                            </Typography>
                          </Tooltip>
                          <Typography variant="caption">${feeDollars.toFixed(2)}</Typography>
                        </Stack>
                        <Divider sx={{ my: 0.5 }} />
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" fontWeight={600}>Total charged to your bank</Typography>
                          <Typography variant="caption" fontWeight={600}>${totalDollars.toFixed(2)}</Typography>
                        </Stack>
                      </Box>
                    )
                  })()}
                </Stack>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Select a bank account:
                  </Typography>
                  <RadioGroup value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                    {methods.map((pm) => (
                      <FormControlLabel
                        key={pm.id}
                        value={pm.id}
                        disabled={!pm.verified}
                        control={<Radio />}
                        label={
                          pm.verified
                            ? `${pm.bankName} •••• ${pm.last4} (${pm.accountType})`
                            : `${pm.bankName} •••• ${pm.last4} — verification pending`
                        }
                      />
                    ))}
                  </RadioGroup>
                </Stack>
                {methods.every((pm) => !pm.verified) && (
                  <Alert severity="warning">
                    Your bank account is awaiting micro-deposit verification. Check your Profile
                    page for a verification link once the deposits appear (1–2 business days).
                  </Alert>
                )}
                {error && (
                  <Alert severity="error">
                    {error.response?.data?.error ?? 'Payment failed. Please try again.'}
                  </Alert>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={isPending}>Cancel</Button>
            {methods.length > 0 && (
              <Button
                variant="contained"
                onClick={handlePay}
                disabled={!selectedId || isPending || !amountValid || methods.find((m) => m.id === selectedId)?.verified === false}
                startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <PaymentIcon />}
              >
                {isPending ? 'Processing…' : amountValid
                  ? `Pay $${(parsedAmount + Math.min(Math.round(parsedAmount * 100 * 0.008), 500) / 100).toFixed(2)}`
                  : 'Confirm Payment'}
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
// ── Tenant Charge Card ────────────────────────────────────────────────────────────────
const TENANT_STATUS_COLOR = { paid: 'success', unpaid: 'warning', partial: 'info', pending: 'info', voided: 'default' }

function TenantChargeCard({ row, onPay }) {
  const color      = TENANT_STATUS_COLOR[row.status] ?? 'default'
  const pendingAmt = Number(row.pending_amount ?? 0)
  const canPay     = (row.status === 'unpaid' || row.status === 'partial') && !row.voided_at && pendingAmt === 0
  const bal        = canPay
    ? (row.status === 'partial' && row.total_paid != null
        ? Math.max(0, parseFloat(row.amount) - parseFloat(row.total_paid))
        : parseFloat(row.amount))
    : 0

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderLeft: 4, borderLeftColor: `${color}.main` }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box flex={1} minWidth={0}>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.25} flexWrap="wrap">
            <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
              {(row.charge_type ?? '').replace(/_/g, ' ')}
            </Typography>
            <Chip label={row.status} color={color} size="small" />
          </Stack>
          {row.description && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {row.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Due {row.due_date?.slice(0, 10) ?? '—'}
          </Typography>
        </Box>
        <Stack alignItems="flex-end" spacing={1} flexShrink={0}>
          <ChargeAmountCell
            amount={row.amount}
            totalPaid={row.total_paid}
            pendingAmount={row.pending_amount}
            status={row.status}
            dueDate={row.due_date}
          />
          {canPay && (
            <Button size="small" startIcon={<PaymentIcon />} onClick={() => onPay(row)}>
              Pay ${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  )
}
// ── TenantChargesPage ────────────────────────────────────────────────────────
export default function TenantChargesPage() {
  const [chargeTab, setChargeTab] = useState(1) // 0 = Outstanding, 1 = All
  const [selectedCharge, setSelectedCharge] = useState(null)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { activeLease, leases, isLoading: loadingLease } = useMyLease()
  const activeLeaseFallback = activeLease ?? leases?.[0]

  const { data: chargesData, isLoading: loadingCharges } = useCharges(
    activeLeaseFallback?.id
      ? { leaseId: activeLeaseFallback.id, ...(chargeTab === 0 ? { unpaidOnly: true } : {}) }
      : undefined,
  )
  const chargeRows = Array.isArray(chargesData) ? chargesData : (chargesData?.charges ?? [])

  const { data: paymentsData, isLoading: loadingPayments } = usePayments(
    activeLeaseFallback?.id ? { leaseId: activeLeaseFallback.id } : undefined,
  )
  const paymentRows = Array.isArray(paymentsData) ? paymentsData : (paymentsData?.payments ?? [])

  const paymentColumns = [
    { field: 'payment_date', headerName: 'Date', width: 130, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'amount_paid', headerName: 'Amount', width: 130, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'payment_method', headerName: 'Method', width: 140 },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: ({ value }) =>
        value === 'pending' ? (
          <Tooltip title="Bank transfer in progress — typically settles in 1–3 business days." arrow>
            <Box><StatusChip status={value} /></Box>
          </Tooltip>
        ) : (
          <StatusChip status={value} />
        ),
    },
    { field: 'notes', headerName: 'Notes', flex: 1 },
  ]

  if (loadingLease) return <LoadingOverlay />

  if (!activeLeaseFallback) {
    return (
      <PageContainer title="Charges">
        <Typography color="text.secondary">No active lease found — no charges to display.</Typography>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Charges">
      {/* ── Charges ─────────────────────────────────────────────────────────────── */}
      <Typography variant="h6" gutterBottom>Your Charges</Typography>
      <Tabs value={chargeTab} onChange={(_, v) => setChargeTab(v)} sx={{ mb: 2 }}>
        <Tab label="Outstanding" />
        <Tab label="All" />
      </Tabs>
      {loadingCharges ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
      ) : chargeRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>No charges found.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {chargeRows.map((row) => (
            <TenantChargeCard key={row.id} row={row} onPay={setSelectedCharge} />
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 4 }} />

      {/* ── Payment History ───────────────────────────────────────────────────────── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6">Payment History</Typography>
      </Box>
      <DataTable rows={paymentRows} columns={paymentColumns} loading={loadingPayments} />

      <PaymentDialog
        charge={selectedCharge}
        open={!!selectedCharge}
        onClose={() => setSelectedCharge(null)}
        fullScreen={isMobile}
      />
    </PageContainer>
  )}