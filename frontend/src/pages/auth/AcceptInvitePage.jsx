import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box, Card, CardContent, Stack, TextField, Button,
  Typography, Alert, CircularProgress, Divider, Chip,
  FormControlLabel, Checkbox, FormGroup, Link,
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import { Link as RouterLink } from 'react-router-dom'

import { useInvitation, useAcceptInvitation } from '../../hooks/useInvitations'
import { useAuthStore } from '../../store/authStore'

const schema = z.object({
  firstName:     z.string().min(1, 'First name is required'),
  lastName:      z.string().min(1, 'Last name is required'),
  email:         z.string().email('Valid email required'),
  phone:         z.string().optional(),
  password:      z.string().min(8, 'Password must be at least 8 characters'),
  confirm:       z.string(),
  emailOptIn:    z.boolean().default(false),
  smsOptIn:      z.boolean().default(false),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy to continue' }),
  }),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

export default function AcceptInvitePage() {
  const { token } = useParams()
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)

  const { data: invite, isLoading, isError, error } = useInvitation(token)
  const { mutate: accept, isPending, error: submitError } = useAcceptInvitation(token)

  const { register, handleSubmit, setValue, formState: { errors }, control } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { emailOptIn: false, smsOptIn: false, acceptedTerms: false },
  })

  // Pre-fill form fields once invitation data is loaded
  useEffect(() => {
    if (invite) {
      if (invite.firstName) setValue('firstName', invite.firstName)
      if (invite.lastName)  setValue('lastName',  invite.lastName)
      if (invite.email)     setValue('email',     invite.email)
    }
  }, [invite, setValue])

  const onSubmit = (values) => {
    const { confirm, ...payload } = values
    accept(payload, {
      onSuccess: ({ user, token: accessToken }) => {
        setAuth(user, accessToken)
        navigate('/my/dashboard', { replace: true })
      },
    })
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    const msg = error?.response?.data?.error || error?.message || 'Invalid or expired invitation'
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', px: 2 }}>
        <Card sx={{ maxWidth: 420, width: '100%' }}>
          <CardContent>
            <Alert severity="error" sx={{ mb: 2 }}>{msg}</Alert>
            <Typography variant="body2" color="text.secondary">
              If you believe this is an error, please contact your landlord for a new invitation.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', px: 2, py: 4 }}>
      <Card sx={{ maxWidth: 460, width: '100%' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Set up your account
          </Typography>

          {/* Property context — shown when invite is tied to a unit */}
          {invite?.propertyName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <HomeIcon color="primary" fontSize="small" />
              <Typography variant="body2">
                {invite.propertyName}
                {invite.propertyAddress ? ` — ${invite.propertyAddress}` : ''}
              </Typography>
              {invite.unitNumber && (
                <Chip label={`Unit ${invite.unitNumber}`} size="small" color="primary" variant="outlined" />
              )}
            </Box>
          )}

          <Divider sx={{ mb: 3 }} />

          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError?.response?.data?.error || submitError?.message || 'Signup failed — please try again.'}
            </Alert>
          )}

          <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First Name"
                fullWidth
                {...register('firstName')}
                error={!!errors.firstName}
                helperText={errors.firstName?.message}
              />
              <TextField
                label="Last Name"
                fullWidth
                {...register('lastName')}
                error={!!errors.lastName}
                helperText={errors.lastName?.message}
              />
            </Stack>

            <TextField
              label="Email"
              type="email"
              fullWidth
              {...register('email')}
              error={!!errors.email}
              helperText={errors.email?.message}
              // If invite pre-filled the email, hint that it's locked to the invite
              InputProps={{ readOnly: !!invite?.email }}
            />

            <TextField
              label="Phone (optional)"
              fullWidth
              {...register('phone')}
              error={!!errors.phone}
              helperText={errors.phone?.message}
            />

            {/* Notification opt-in — required for compliance */}
            <Box sx={{ bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Communication preferences
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Choose how your landlord may contact you. You can update these in your profile at any time.
              </Typography>
              <FormGroup>
                <Controller
                  name="emailOptIn"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">Email notifications (rent reminders, lease updates)</Typography>}
                    />
                  )}
                />
                <Controller
                  name="smsOptIn"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">SMS notifications (urgent alerts, payment reminders)</Typography>}
                    />
                  )}
                />
              </FormGroup>
            </Box>

            <Divider />

            <TextField
              label="Create Password"
              type="password"
              fullWidth
              {...register('password')}
              error={!!errors.password}
              helperText={errors.password?.message}
            />
            <TextField
              label="Confirm Password"
              type="password"
              fullWidth
              {...register('confirm')}
              error={!!errors.confirm}
              helperText={errors.confirm?.message}
            />

            {/* Terms of Service + Privacy Policy acceptance */}
            <Controller
              name="acceptedTerms"
              control={control}
              render={({ field: f }) => (
                <FormControlLabel
                  sx={{ alignItems: 'flex-start' }}
                  control={
                    <Checkbox
                      checked={f.value}
                      onChange={(e) => f.onChange(e.target.checked)}
                      size="small"
                      sx={{ pt: 0.5 }}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      I agree to the{' '}
                      <Link component={RouterLink} to="/terms" target="_blank" rel="noopener">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link component={RouterLink} to="/privacy" target="_blank" rel="noopener">
                        Privacy Policy
                      </Link>
                    </Typography>
                  }
                />
              )}
            />
            {errors.acceptedTerms && (
              <Typography variant="caption" color="error" display="block" sx={{ ml: '14px' }}>
                {errors.acceptedTerms.message}
              </Typography>
            )}

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={isPending}
            >
              {isPending ? 'Creating account…' : 'Create account & sign in'}
            </Button>

            <Typography variant="caption" color="text.secondary" textAlign="center">
              Already have an account?{' '}
              <a href="/login" style={{ color: 'inherit' }}>Sign in</a>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
