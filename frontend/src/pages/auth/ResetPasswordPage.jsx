import { useEffect } from 'react'
import { useSearchParams, Link as RouterLink } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box, Card, CardContent, TextField, Button,
  Typography, Alert, Link,
} from '@mui/material'
import { useResetPassword } from '../../hooks/useAuth'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { mutate: reset, isPending, error } = useResetPassword()

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data) => reset({ token, password: data.password })

  if (!token) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Card sx={{ maxWidth: 400, width: '100%' }}>
          <CardContent sx={{ p: 4 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              Invalid or missing reset token.
            </Alert>
            <Typography variant="body2" textAlign="center">
              <Link component={RouterLink} to="/forgot-password">Request a new reset link</Link>
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
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
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Choose a new password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter a new password for your account.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.response?.data?.error || error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'This link is invalid or has expired.'}
              {' '}
              <Link component={RouterLink} to="/forgot-password">Request a new link.</Link>
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)}>
            <TextField
              label="New Password"
              type="password"
              fullWidth
              sx={{ mb: 2 }}
              {...register('password')}
              error={!!errors.password}
              helperText={errors.password?.message}
            />
            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
              sx={{ mb: 3 }}
              {...register('confirm')}
              error={!!errors.confirm}
              helperText={errors.confirm?.message}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={isPending}
            >
              {isPending ? 'Updating…' : 'Set new password'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
