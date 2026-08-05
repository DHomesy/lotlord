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
 * Offers an upgrade CTA that opens the Stripe Checkout flow.
 */
export default function UpgradePromptDialog({ open, onClose, message }) {
  const { mutate: checkout, isPending } = useCreateCheckoutSession()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Upgrade to Autopilot</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {message || 'You have reached the free plan limit.'}
          {' '}Upgrade to Autopilot or Portfolio to unlock higher limits and advanced workflows.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => checkout('autopilot')}
          disabled={isPending}
        >
          {isPending ? 'Loading…' : 'Upgrade to Autopilot'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
