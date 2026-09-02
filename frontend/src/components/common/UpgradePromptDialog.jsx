import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material'
import { useCreateCheckoutSession } from '../../hooks/useBilling'

/**
 * Shown when an API call returns 402 (free tier limit hit).
 * Offers an "Upgrade" CTA that opens the Stripe Checkout flow.
 */
export default function UpgradePromptDialog({ open, onClose, message }) {
  const { mutate: checkout, isPending } = useCreateCheckoutSession()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Upgrade to Paid</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {message || 'You have reached the free plan limit.'}
          {' '}Upgrade to Paid ($10/mo) to remove limits and unlock expanded access.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => checkout()}
          disabled={isPending}
        >
          {isPending ? 'Loading…' : 'Upgrade to Paid'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
