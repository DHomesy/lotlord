import { useState } from 'react'
import {
  Box, Card, CardContent, Typography, Button, Alert, Stack,
} from '@mui/material'
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread'
import { useResendVerification, useLogout } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/authStore'

export default function VerifyEmailPendingPage() {
  const { mutate: resend, isPending, isSuccess, isError, error } = useResendVerification()
  const { mutate: logout } = useLogout()
  const user = useAuthStore((s) => s.user)
  const [resendCount, setResendCount] = useState(0)

  const handleResend = () => {
    resend(undefined, { onSuccess: () => setResendCount((c) => c + 1) })
  }

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
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <MarkEmailUnreadIcon sx={{ fontSize: 56, color: 'primary.main', mb: 1.5 }} />

          <Typography variant="h5" fontWeight={700} gutterBottom>
            Check your inbox
          </Typography>

          <Typography color="text.secondary" sx={{ mb: 1 }}>
            We sent a verification link to
          </Typography>
          <Typography fontWeight={600} sx={{ mb: 3 }}>
            {user?.email}
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Click the link in the email to activate your LotLord account. If you don't see it,
            check your spam folder.
          </Typography>

          {isSuccess && resendCount > 0 && (
            <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
              Verification email resent. Please check your inbox.
            </Alert>
          )}

          {isError && (
            <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
              {error?.response?.data?.error ?? 'Something went wrong. Please try again.'}
            </Alert>
          )}

          <Stack spacing={1.5}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleResend}
              disabled={isPending}
            >
              {isPending ? 'Sending…' : 'Resend verification email'}
            </Button>
            <Button
              variant="text"
              color="inherit"
              fullWidth
              onClick={() => logout()}
              sx={{ color: 'text.secondary' }}
            >
              Log in with a different account
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
