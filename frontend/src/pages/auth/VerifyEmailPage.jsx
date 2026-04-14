import { useEffect } from 'react'
import { useSearchParams, Link as RouterLink } from 'react-router-dom'
import {
  Box, Card, CardContent, Typography, CircularProgress, Button, Alert,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useVerifyEmail } from '../../hooks/useAuth'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { mutate: verify, isPending, isSuccess, isError, error } = useVerifyEmail()

  useEffect(() => {
    if (token) verify({ token })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
        px: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            LotLord
          </Typography>

          {!token && (
            <Alert severity="error" sx={{ textAlign: 'left', mt: 1 }}>
              No verification token found. Please use the link from your email.
            </Alert>
          )}

          {token && isPending && (
            <>
              <CircularProgress sx={{ mt: 2, mb: 2 }} />
              <Typography color="text.secondary">Verifying your email address…</Typography>
            </>
          )}

          {isSuccess && (
            <>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mt: 1, mb: 1 }} />
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Email verified!
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Your account is now active. Taking you to your dashboard…
              </Typography>
            </>
          )}

          {isError && (
            <>
              <ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main', mt: 1, mb: 1 }} />
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Verification failed
              </Typography>
              <Alert severity="error" sx={{ textAlign: 'left', mb: 3 }}>
                {error?.response?.data?.error ?? 'This link is invalid or has expired.'}
              </Alert>
              <Button component={RouterLink} to="/verify-email-pending" variant="contained" fullWidth>
                Resend Verification Email
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
