import { useEffect } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Container, Grid, Typography, Stack, Card, CardContent, Divider, Chip,
} from '@mui/material'
import ApartmentIcon   from '@mui/icons-material/Apartment'
import PaymentsIcon    from '@mui/icons-material/Payments'
import BuildIcon       from '@mui/icons-material/Build'
import NotificationsIcon from '@mui/icons-material/Notifications'
import CheckIcon       from '@mui/icons-material/Check'
import { useAuthStore } from '../store/authStore'

// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    Icon: ApartmentIcon,
    title: 'Properties & Units',
    body: 'Add unlimited properties, configure individual units, and track vacancy, rent amounts, and tenant assignments in one place.',
  },
  {
    Icon: PaymentsIcon,
    title: 'Online Rent Collection',
    body: 'Accept ACH or card payments via Stripe. Charges are created automatically each month and reconciled against your ledger.',
  },
  {
    Icon: BuildIcon,
    title: 'Maintenance Tracking',
    body: 'Tenants submit requests directly through the portal. Track status from open → in-progress → completed with full history.',
  },
  {
    Icon: NotificationsIcon,
    title: 'Automated Reminders',
    body: 'Rent-due reminders, lease-expiry alerts, and overdue notices sent automatically — no manual follow-up required.',
  },
]

const FREE_FEATURES = [
  '1 property, up to 4 tenants',
  'Maintenance request tracking',
  'Tenant portal access',
  'Lease management',
]

const PRO_FEATURES = [
  'Unlimited properties & tenants',
  'Online rent collection (Stripe)',
  'Dashboard analytics',
  'Automated rent reminders',
  'Late fee automation',
  'Everything in Free',
]

// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  // Redirect authenticated users straight to dashboard
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <Box
        component="nav"
        sx={{
          position: 'sticky', top: 0, zIndex: 10,
          bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider',
          py: 1.5,
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700} color="primary">
              LotLord
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/login" variant="outlined" size="small">
                Log In
              </Button>
              <Button component={RouterLink} to="/register" variant="contained" size="small">
                Get Started Free
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          background: (t) =>
            t.palette.mode === 'dark'
              ? 'linear-gradient(160deg, #1a237e 0%, #0d47a1 100%)'
              : 'linear-gradient(160deg, #e3f2fd 0%, #bbdefb 100%)',
          py: { xs: 8, md: 12 },
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h2" fontWeight={800} gutterBottom sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>
            Manage your properties<br />with confidence
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4, fontWeight: 400 }}>
            LotLord is the all-in-one property management platform for independent landlords —
            rent collection, maintenance, tenants, and more.
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
            <Button
              component={RouterLink}
              to="/register"
              variant="contained"
              size="large"
              sx={{ px: 4 }}
            >
              Get Started Free
            </Button>
            <Button
              component={RouterLink}
              to="/login"
              variant="outlined"
              size="large"
              sx={{ px: 4 }}
            >
              Log In
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>
            No credit card required · Free plan available
          </Typography>
        </Container>
      </Box>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Typography variant="h4" fontWeight={700} textAlign="center" gutterBottom>
          Everything you need to run your rentals
        </Typography>
        <Typography color="text.secondary" textAlign="center" mb={6}>
          Purpose-built for small and mid-size landlords.
        </Typography>
        <Grid container spacing={3}>
          {FEATURES.map(({ Icon, title, body }) => (
            <Grid item xs={12} sm={6} key={title}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center" mb={1.5}>
                    <Icon color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>
                      {title}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {body}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Divider />

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Typography variant="h4" fontWeight={700} textAlign="center" gutterBottom>
          Simple pricing
        </Typography>
        <Typography color="text.secondary" textAlign="center" mb={6}>
          Start free. Upgrade when you're ready.
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {/* Free */}
          <Grid item xs={12} sm={6} md={5}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700} gutterBottom>Free</Typography>
                <Typography variant="h3" fontWeight={800} gutterBottom>
                  $0<Typography component="span" variant="body2" color="text.secondary"> / mo</Typography>
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1}>
                  {FREE_FEATURES.map((f) => (
                    <Stack key={f} direction="row" spacing={1} alignItems="center">
                      <CheckIcon fontSize="small" color="success" />
                      <Typography variant="body2">{f}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Button
                  component={RouterLink}
                  to="/register"
                  variant="outlined"
                  fullWidth
                  sx={{ mt: 3 }}
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Pro */}
          <Grid item xs={12} sm={6} md={5}>
            <Card
              variant="outlined"
              sx={{ height: '100%', borderColor: 'primary.main', borderWidth: 2 }}
            >
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <Typography variant="h6" fontWeight={700}>Pro</Typography>
                  <Chip label="Most popular" size="small" color="primary" />
                </Stack>
                <Typography variant="h3" fontWeight={800} gutterBottom>
                  $29<Typography component="span" variant="body2" color="text.secondary"> / mo</Typography>
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1}>
                  {PRO_FEATURES.map((f) => (
                    <Stack key={f} direction="row" spacing={1} alignItems="center">
                      <CheckIcon fontSize="small" color="success" />
                      <Typography variant="body2">{f}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Button
                  component={RouterLink}
                  to="/register"
                  variant="contained"
                  fullWidth
                  sx={{ mt: 3 }}
                >
                  Start Free Trial
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Box
        component="footer"
        sx={{
          borderTop: '1px solid', borderColor: 'divider',
          py: 3, textAlign: 'center',
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" spacing={3} justifyContent="center" flexWrap="wrap">
            <Typography
              component={RouterLink}
              to="/terms"
              variant="body2"
              color="text.secondary"
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Terms of Service
            </Typography>
            <Typography
              component={RouterLink}
              to="/privacy"
              variant="body2"
              color="text.secondary"
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Privacy Policy
            </Typography>
            <Typography
              component={RouterLink}
              to="/login"
              variant="body2"
              color="text.secondary"
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Log In
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
            © {new Date().getFullYear()} LotLord. All rights reserved.
          </Typography>
        </Container>
      </Box>

    </Box>
  )
}
