import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material'

/**
 * Reusable "are you sure?" dialog.
 *
 * @param {boolean}  open
 * @param {string}   title
 * @param {string}   message
 * @param {function} onConfirm
 * @param {function} onCancel
 * @param {boolean}  loading     - disables the confirm button
 */
export default function ConfirmDialog({
  open,
  title = 'Confirm',
  message = 'Are you sure?',
  onConfirm,
  onCancel,
  loading,
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
          {loading ? 'Deleting…' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
