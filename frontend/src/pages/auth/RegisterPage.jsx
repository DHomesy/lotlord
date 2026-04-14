import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Checkbox,
} from '@mui/material'
import ApartmentIcon from '@mui/icons-material/Apartment'
import PersonIcon from '@mui/icons-material/Person'
import { Link as RouterLink } from 'react-router-dom'
import { useRegister } from '../../hooks/useAuth'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy to continue' }),
  }),
})

const roleInfo = {
  landlord: 'Manage your properties, tenants, leases, and finances.',
  tenant: 'View your lease, pay rent, and submit maintenance requests.',
}

export default function RegisterPage() {
  const [role, setRole] = useState('landlord')
  const { mutate: register, isPending, error } = useRegister()

  const { register: field, handleSubmit, formState: { errors }, control } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { acceptedTerms: false },
  })

  const onSubmit = (data) => register({ ...data, role })

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
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            LotLord
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a new account
          </Typography>

          {/* Role selection */}
          <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
            I am a…
          </Typography>
          <ToggleButtonGroup
            value={role}
            exclusive
            onChange={(_, v) => { if (v) setRole(v) }}
            fullWidth
            sx={{ mb: 1 }}
          >
            <ToggleButton value="landlord" sx={{ gap: 1 }}>
              <ApartmentIcon fontSize="small" /> Landlord
            </ToggleButton>
            <ToggleButton value="tenant" sx={{ gap: 1 }}>
              <PersonIcon fontSize="small" /> Tenant
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
            {roleInfo[role]}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.response?.data?.error || error.response?.data?.message || 'Registration failed. Please try again.'}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)}>
            <TextField
              label="First Name"
              fullWidth
              sx={{ mb: 2 }}
              {...field('firstName')}
              error={!!errors.firstName}
              helperText={errors.firstName?.message}
            />
            <TextField
              label="Last Name"
              fullWidth
              sx={{ mb: 2 }}
              {...field('lastName')}
              error={!!errors.lastName}
              helperText={errors.lastName?.message}
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              sx={{ mb: 2 }}
              {...field('email')}
              error={!!errors.email}
              helperText={errors.email?.message}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              sx={{ mb: 3 }}
              {...field('password')}
              error={!!errors.password}
              helperText={errors.password?.message}
            />

            {/* Terms of Service + Privacy Policy acceptance */}
            <Controller
              name="acceptedTerms"
              control={control}
              render={({ field: f }) => (
                <FormControlLabel
                  sx={{ alignItems: 'flex-start', mb: errors.acceptedTerms ? 0 : 2 }}
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
              <Typography variant="caption" color="error" display="block" sx={{ mb: 2, ml: '14px' }}>
                {errors.acceptedTerms.message}
              </Typography>
            )}

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={isPending}
            >
              {isPending ? 'Creating account…' : `Sign up as ${role === 'landlord' ? 'Landlord' : 'Tenant'}`}
            </Button>
          </Box>

          <Typography variant="body2" sx={{ mt: 3, textAlign: 'center' }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
              Sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
