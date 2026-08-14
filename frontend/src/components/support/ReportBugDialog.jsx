import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useReportBug } from '../../hooks/useNotifications'

const schema = z.object({
  summary: z.string().trim().min(1, 'Summary is required').max(160, 'Max 160 characters'),
  details: z.string().trim().min(1, 'Details are required').max(3000, 'Max 3000 characters'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
})

export default function ReportBugDialog({ open, onClose }) {
  const { mutate: reportBug, isPending, isSuccess, error, reset } = useReportBug()

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      summary: '',
      details: '',
      severity: 'medium',
    },
  })

  useEffect(() => {
    if (!open) {
      resetForm()
      reset()
    }
  }, [open, resetForm, reset])

  function onSubmit(values) {
    reportBug(
      {
        ...values,
        pageUrl: window.location.href,
      },
      {
        onSuccess: () => {
          resetForm()
        },
      },
    )
  }

  const errMsg = error?.response?.data?.error || 'Could not submit bug report. Please try again.'

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Report a Bug</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Share what happened and we will investigate quickly.
        </Typography>

        {isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Thanks. Your report was submitted.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errMsg}
          </Alert>
        )}

        <Stack component="form" id="report-bug-form" spacing={2} onSubmit={handleSubmit(onSubmit)}>
          <TextField
            label="Summary"
            placeholder="Short title for the issue"
            {...register('summary')}
            error={!!errors.summary}
            helperText={errors.summary?.message}
            inputProps={{ maxLength: 160 }}
          />

          <TextField
            label="Severity"
            select
            defaultValue="medium"
            {...register('severity')}
            error={!!errors.severity}
            helperText={errors.severity?.message}
          >
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </TextField>

          <TextField
            label="Details"
            placeholder="Steps to reproduce, expected behavior, and what happened"
            {...register('details')}
            error={!!errors.details}
            helperText={errors.details?.message}
            multiline
            minRows={4}
            inputProps={{ maxLength: 3000 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" form="report-bug-form" variant="contained" disabled={isPending}>
          {isPending ? 'Submitting...' : 'Submit Report'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
