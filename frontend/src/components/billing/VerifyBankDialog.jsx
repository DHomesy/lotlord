import { useState } from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useVerifyMyPaymentMethod } from '../../hooks/useStripeSetup'

export default function VerifyBankDialog({ paymentMethod, open, onClose }) {
  const [firstAmount, setFirstAmount] = useState('')
  const [secondAmount, setSecondAmount] = useState('')
  const { mutate: verify, isPending, error, reset } = useVerifyMyPaymentMethod()

  function handleClose() {
    reset()
    setFirstAmount('')
    setSecondAmount('')
    onClose()
  }

  function handleSubmit(event) {
    event.preventDefault()
    verify({
      paymentMethodId: paymentMethod.id,
      amounts: [Number(firstAmount), Number(secondAmount)],
    }, { onSuccess: handleClose })
  }

  return (
    <Dialog open={open} onClose={isPending ? undefined : handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Verify {paymentMethod?.bankName ?? 'bank account'}</DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="verify-bank-form" spacing={2} onSubmit={handleSubmit}>
          <Typography variant="body2" color="text.secondary">
            Enter the two Stripe deposits shown in your bank account. Enter cents only, such as 32 and 45.
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="First amount"
              value={firstAmount}
              onChange={(event) => setFirstAmount(event.target.value)}
              type="number"
              inputProps={{ min: 1, max: 99 }}
              fullWidth
            />
            <TextField
              label="Second amount"
              value={secondAmount}
              onChange={(event) => setSecondAmount(event.target.value)}
              type="number"
              inputProps={{ min: 1, max: 99 }}
              fullWidth
            />
          </Stack>
          {error && (
            <Alert severity="error">
              {error?.response?.data?.error ?? 'Those amounts could not be verified.'}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>Cancel</Button>
        <Button
          type="submit"
          form="verify-bank-form"
          variant="contained"
          disabled={isPending || !firstAmount || !secondAmount}
        >
          {isPending && <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />}
          Verify account
        </Button>
      </DialogActions>
    </Dialog>
  )
}