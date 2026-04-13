import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box, Card, CardContent, TextField, Button,
  Typography, Alert, Link,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useForgotPassword } from '../../hooks/useAuth'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export default function ForgotPasswordPage() {
  const { mutate: forgot, isPending, isSuccess, error } = useForgotPassword()

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data) => forgot(data)

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
            Forgot your password?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter your email address and we'll send you a link to reset your password.
          </Typography>

          {isSuccess ? (
            <Alert severity="success">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </Alert>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error.response?.data?.message || 'Something went wrong. Please try again.'}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit(onSubmit)}>
                <TextField
                  label="Email"
                  type="email"
                  fullWidth
                  sx={{ mb: 3 }}
                  {...register('email')}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={isPending}
                >
                  {isPending ? 'Sending…' : 'Send reset link'}
                </Button>
              </Box>
            </>
          )}

          <Typography variant="body2" sx={{ mt: 3, textAlign: 'center' }}>
            <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
              Back to sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
