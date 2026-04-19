import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Tab, Tabs, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  RadioGroup, FormControlLabel, Radio, Alert, Stack, CircularProgress, Divider, Box,
  useTheme, useMediaQuery,
} from '@mui/material'
import PaymentIcon from '@mui/icons-material/Payment'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
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
  const [succeeded, setSucceeded] = useState(false)
  const { mutate: pay, isPending, error, reset } = useCreateMyPaymentIntent()

  // Reset state whenever the dialog opens for a new charge
  useEffect(() => {
    if (open) {
      setSucceeded(false)
      reset()
      setSelectedId(methods[0]?.id ?? '')
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

  function handlePay() {
    pay(
      { chargeId: charge.id, paymentMethodId: selectedId },
      { onSuccess: () => setSucceeded(true) },
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
              Your ACH payment of <strong>${Number(charge.amount).toLocaleString()}</strong> is
              processing. It typically takes 1-5 business days to settle.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={onClose}>Done</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>Pay ${Number(charge?.amount ?? 0).toLocaleString()}</DialogTitle>
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
              <Stack spacing={1} sx={{ pt: 1 }}>
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
                {methods.every((pm) => !pm.verified) && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    Your bank account is awaiting micro-deposit verification. Check your Profile
                    page for a verification link once the deposits appear (1–2 business days).
                  </Alert>
                )}
                {error && (
                  <Alert severity="error" sx={{ mt: 1 }}>
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
                disabled={!selectedId || isPending || methods.find((m) => m.id === selectedId)?.verified === false}
                startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <PaymentIcon />}
              >
                {isPending ? 'Processing…' : 'Confirm Payment'}
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
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

  const chargeColumns = [
    { field: 'charge_type', headerName: 'Type', width: 120 },
    { field: 'description', headerName: 'Description', flex: 1 },
    { field: 'amount', headerName: 'Amount', width: 120, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'due_date', headerName: 'Due', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'status', headerName: 'Status', width: 110, renderCell: ({ value }) => <StatusChip status={value} /> },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) =>
        row.status === 'unpaid' && !row.voided_at ? (
          <Button size="small" startIcon={<PaymentIcon />} onClick={() => setSelectedCharge(row)}>
            Pay
          </Button>
        ) : null,
    },
  ]

  const paymentColumns = [
    { field: 'created_at', headerName: 'Date', width: 130, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'amount_paid', headerName: 'Amount', width: 130, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    { field: 'payment_method', headerName: 'Method', width: 140 },
    { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
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
      <DataTable rows={chargeRows} columns={chargeColumns} loading={loadingCharges} />

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