import { useState, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { stripePromise } from '../../lib/stripe'
import { useCreateSetupIntent, useCreateMySetupIntent } from '../../hooks/useStripeSetup'
import { useQueryClient } from '@tanstack/react-query'

// ── Inner form rendered inside the <Elements> provider ────────────────────────
function BankSetupForm({ onSuccess, onCancel }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Handle the redirect-return case (Financial Connections OAuth flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('redirect_status') === 'succeeded') {
      // Clean the URL and signal success
      const clean = window.location.pathname
      window.history.replaceState({}, '', clean)
      onSuccess()
    }
  }, [onSuccess])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)

    const { setupIntent, error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href.split('?')[0] + '?redirect_status=succeeded',
      },
      // Don't redirect unless Stripe absolutely requires it (instant-auth banks won't redirect)
      redirect: 'if_required',
    })

    setLoading(false)
    if (stripeError) {
      setError(stripeError.message)
    } else {
      // Detect micro-deposit case: setupIntent still requires_action after confirm
      const requiresMicrodeposits =
        setupIntent?.status === 'requires_action' &&
        setupIntent?.next_action?.type === 'verify_with_microdeposits'
      const hostedVerificationUrl =
        setupIntent?.next_action?.verify_with_microdeposits?.hosted_verification_url ?? null
      onSuccess({ requiresMicrodeposits, hostedVerificationUrl })
    }
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Enter your bank account details below. Most banks support instant verification
        through Stripe Financial Connections. Others use micro-deposit verification
        (2–3 business days).
      </Typography>
      <PaymentElement options={{ fields: { billingDetails: 'auto' } }} />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={loading || !stripe}>
          {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          {loading ? 'Saving…' : 'Save Bank Account'}
        </Button>
      </Stack>
    </Stack>
  )
}

// ── Main ConnectBankDialog ─────────────────────────────────────────────────────
/**
 * Props:
 *   open        {boolean}  — controls dialog visibility
 *   onClose     {function} — called when dialog should close
 *   tenantId    {string}   — if provided, admin flow (creates SetupIntent for this tenant)
 *   tenantName  {string}   — display name for the dialog title
 *   onConnected {function} — optional callback after successful bank connection
 */
export default function ConnectBankDialog({ open, onClose, tenantId, tenantName, onConnected }) {
  const qc = useQueryClient()
  const [step,                  setStep]                  = useState('idle')   // idle | loading | form | success
  const [clientSecret,          setClientSecret]          = useState(null)
  const [setupError,            setSetupError]            = useState(null)
  const [requiresMicrodeposits, setRequiresMicrodeposits] = useState(false)
  const [verificationUrl,       setVerificationUrl]       = useState(null)

  const { mutate: createAdmin  } = useCreateSetupIntent()
  const { mutate: createSelf   } = useCreateMySetupIntent()

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('idle')
      setClientSecret(null)
      setSetupError(null)
      setRequiresMicrodeposits(false)
      setVerificationUrl(null)
    }
  }, [open])

  function handleBegin() {
    setStep('loading')
    setSetupError(null)

    const mutate = tenantId ? createAdmin : createSelf
    const args   = tenantId ? tenantId : undefined

    mutate(args, {
      onSuccess: (data) => {
        setClientSecret(data.clientSecret)
        setStep('form')
      },
      onError: (err) => {
        setSetupError(err?.response?.data?.error ?? 'Failed to start bank setup. Please try again.')
        setStep('idle')
      },
    })
  }

  function handleSuccess({ requiresMicrodeposits: needsMicro = false, hostedVerificationUrl = null } = {}) {
    setRequiresMicrodeposits(needsMicro)
    setVerificationUrl(hostedVerificationUrl)
    setStep('success')
    // Refresh the payment-methods list so the parent component updates
    if (tenantId) qc.invalidateQueries({ queryKey: ['payment-methods', tenantId] })
    else          qc.invalidateQueries({ queryKey: ['my-payment-methods'] })
    onConnected?.()
  }

  const title = tenantName
    ? `Connect Bank Account — ${tenantName}`
    : 'Connect Bank Account'

  if (!stripePromise) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Stripe is not configured. Set <code>VITE_STRIPE_PUBLISHABLE_KEY</code> in your
            frontend <code>.env</code> file and restart the dev server.
          </Alert>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={step === 'loading' ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AccountBalanceIcon color="primary" />
          <span>{title}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {/* ── Idle — explain & begin ── */}
        {step === 'idle' && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Link a bank account to enable ACH rent collection. Stripe uses Financial Connections
              for instant verification with most major banks. There is no charge for adding a bank —
              fees apply only when a payment is processed (0.8%, capped at $5).
            </Typography>
            {setupError && <Alert severity="error">{setupError}</Alert>}
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" onClick={handleBegin}>
                Begin Setup
              </Button>
            </Box>
          </Stack>
        )}

        {/* ── Loading — creating SetupIntent ── */}
        {step === 'loading' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Starting secure bank setup…</Typography>
          </Stack>
        )}

        {/* ── Form — Stripe PaymentElement ── */}
        {step === 'form' && clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <BankSetupForm onSuccess={handleSuccess} onCancel={onClose} />
          </Elements>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 3 }}>
            <CheckCircleOutlineIcon color={requiresMicrodeposits ? 'warning' : 'success'} sx={{ fontSize: 56 }} />
            {requiresMicrodeposits ? (
              <>
                <Typography variant="h6" textAlign="center">Check Your Bank Account</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Stripe has sent two small micro-deposits to your bank account. This typically
                  takes <strong>1–2 business days</strong>. Once they appear, click below to
                  verify the amounts and activate your account for payments.
                </Typography>
                {verificationUrl && (
                  <Button
                    variant="outlined"
                    href={verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify Micro-Deposits →
                  </Button>
                )}
              </>
            ) : (
              <>
                <Typography variant="h6">Bank Account Connected!</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Your bank account has been verified and saved. You can now use it to pay
                  rent from the Charges page.
                </Typography>
              </>
            )}
            <Button variant="contained" onClick={onClose}>Done</Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
