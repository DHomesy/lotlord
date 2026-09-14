import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { stripePromise } from '../../lib/stripe'
import { createBillingSetupIntent, completeBillingPaymentMethod } from '../../api/billing'

function BillingPaymentMethodForm({ setupIntentId, onClose, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!stripe || !elements) return
    setSaving(true)
    setError(null)

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payments?billing_setup=return`,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    try {
      await completeBillingPaymentMethod(result.setupIntent?.id ?? setupIntentId)
      onSuccess()
    } catch (requestError) {
      setError(requestError?.response?.data?.error ?? 'Could not save this payment method.')
      setSaving(false)
    }
  }

  return (
    <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
      <Typography variant="body2" color="text.secondary">
        Stripe securely stores this card and uses it for future LotLord subscription renewals.
      </Typography>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <Alert severity="error">{error}</Alert>}
      <DialogActions sx={{ px: 0 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!stripe || saving}>
          {saving && <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />}
          {saving ? 'Saving...' : 'Save payment method'}
        </Button>
      </DialogActions>
    </Stack>
  )
}

export default function BillingPaymentMethodDialog({ open, onClose, onSuccess }) {
  const [setup, setSetup] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setSetup(null)
      setError(null)
      return
    }

    let active = true
    createBillingSetupIntent()
      .then((result) => { if (active) setSetup(result) })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.error ?? 'Could not start secure card setup.')
      })
    return () => { active = false }
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Subscription payment method</DialogTitle>
      <DialogContent dividers>
        {!stripePromise && <Alert severity="warning">Stripe is not configured for this deployment.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!error && !setup && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Loading secure payment fields...</Typography>
          </Stack>
        )}
        {stripePromise && setup?.clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret: setup.clientSecret, appearance: { theme: 'stripe' } }}>
            <BillingPaymentMethodForm
              setupIntentId={setup.setupIntentId}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  )
}