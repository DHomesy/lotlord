import { useState } from 'react'
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { stripePromise } from '../../lib/stripe'
import { createEmbeddedCheckoutSession } from '../../api/billing'

export default function EmbeddedSubscriptionCheckout({ open, onClose, onComplete }) {
  const [error, setError] = useState(null)

  async function fetchClientSecret() {
    try {
      setError(null)
      const { clientSecret } = await createEmbeddedCheckoutSession()
      return clientSecret
    } catch (requestError) {
      setError(requestError?.response?.data?.error ?? 'Could not start checkout. Please try again.')
      throw requestError
    }
  }

  function handleComplete() {
    onComplete()
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <LockOutlinedIcon color="primary" />
          <Box>
            <Typography variant="h6">Upgrade to Paid</Typography>
            <Typography variant="caption" color="text.secondary">
              $10 monthly, processed securely by Stripe
            </Typography>
          </Box>
        </Stack>
        <IconButton
          aria-label="Close checkout"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 520, p: { xs: 1, sm: 2 } }}>
        {!stripePromise && (
          <Alert severity="warning">
            Stripe is not configured. Add VITE_STRIPE_PUBLISHABLE_KEY and restart the frontend.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {stripePromise && (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret, onComplete: handleComplete }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </DialogContent>
    </Dialog>
  )
}