import { useState, useEffect } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Button, Card, CardContent, Chip, Container,
  Divider, Grid, Stack, Typography,
} from '@mui/material'
import ApartmentIcon      from '@mui/icons-material/Apartment'
import BuildIcon          from '@mui/icons-material/Build'
import CheckIcon          from '@mui/icons-material/Check'
import ExpandMoreIcon     from '@mui/icons-material/ExpandMore'
import FolderOpenIcon     from '@mui/icons-material/FolderOpen'
import NotificationsIcon  from '@mui/icons-material/Notifications'
import PaymentsIcon       from '@mui/icons-material/Payments'
import PeopleIcon         from '@mui/icons-material/People'
import { useAuthStore } from '../store/authStore'

// ─── data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: ApartmentIcon,
    title: 'Properties & Units',
    body: 'Add properties, configure units, track vacancies, rent amounts, and tenant assignments — all in one place.',
  },
  {
    Icon: PaymentsIcon,
    title: 'Online Rent Collection',
    body: 'Accept ACH bank transfers or card payments via Stripe. Monthly charges are auto-created and reconciled against your ledger.',
  },
  {
    Icon: BuildIcon,
    title: 'Maintenance Tracking',
    body: 'Tenants submit requests directly. Track each one from Open → In Progress → Closed with photo attachments and full history.',
  },
  {
    Icon: NotificationsIcon,
    title: 'Automated Reminders',
    body: 'Rent-due reminders, overdue notices, and lease-expiry alerts fire automatically. Stop chasing tenants manually.',
  },
  {
    Icon: FolderOpenIcon,
    title: 'Document Storage',
    body: 'Upload signed leases, inspection reports, and receipts. Tenants can download their documents directly from the portal.',
  },
  {
    Icon: PeopleIcon,
    title: 'Tenant Portal',
    body: 'Every tenant gets a secure login. They pay rent, submit maintenance, and view documents without ever texting you.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Create your account',
    body: 'Sign up in under two minutes. No credit card required — the free plan is yours immediately.',
  },
  {
    number: '02',
    title: 'Add a property & invite tenants',
    body: 'Enter your property address, add units, then send tenants a secure invite link. They create their own login.',
  },
  {
    number: '03',
    title: 'Collect rent & manage everything',
    body: 'Charges are created automatically. Tenants pay online. You track maintenance, documents, and finances from your dashboard.',
  },
]

const FAQ = [
  {
    q: 'Is LotLord really free?',
    a: 'Yes. The free plan is genuinely free — no trial periods, no hidden fees. You get 1 property and up to 4 units with core features including tenant management, maintenance tracking, and document storage.',
  },
  {
    q: "What's included in the free plan?",
    a: '1 property · up to 4 units · up to 4 active tenants · online ACH rent collection · tenant portal access · lease management · maintenance request tracking · document storage. Portfolio analytics require a Starter or higher plan.',
  },
  {
    q: 'How does online rent collection work?',
    a: 'LotLord uses Stripe to process ACH bank transfers and card payments. Tenants pay from their portal — funds are deposited directly into your connected bank account, typically within 2 business days.',
  },
  {
    q: 'Is my financial data secure?',
    a: 'All data is encrypted in transit (TLS) and at rest. Payment processing is handled entirely by Stripe — LotLord never stores card or bank account numbers.',
  },
  {
    q: 'Can my tenants pay rent on mobile?',
    a: 'Absolutely. The tenant portal is fully mobile-responsive. Tenants can pay rent, submit maintenance requests, and view documents from any phone or tablet.',
  },
  {
    q: 'Can I cancel or change my plan anytime?',
    a: "Yes — no contracts, no cancellation fees. You can downgrade or cancel from your profile page at any time. You'll retain access until the end of your current billing cycle.",
  },
  {
    q: 'Do I need technical knowledge to get started?',
    a: "Not at all. LotLord walks you through adding your first property, inviting tenants, and connecting your bank account step-by-step. Most landlords are fully set up in under 10 minutes.",
  },
  {
    q: "What happens when I reach my plan's limit?",
    a: "You'll see a clear upgrade prompt before hitting any limit. Your existing data is never affected — we won't lock you out. Simply upgrade to the appropriate plan to keep growing.",
  },
]

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '/ mo',
    description: 'Perfect for brand-new landlords with a single property.',
    features: ['1 property · up to 4 units', 'Up to 4 active tenants', 'Online ACH rent collection', 'Tenant portal access', 'Maintenance tracking', 'Lease & document storage', 'Email notifications'],
    cta: 'Get Started Free',
    ctaVariant: 'outlined',
    highlight: false,
    badge: null,
  },
  {
    name: 'Starter',
    price: '$15',
    period: '/ mo',
    description: 'Ideal for growing landlords managing multiple properties.',
    features: ['Up to 25 properties', 'Unlimited units & tenants', 'Dashboard analytics', 'Portfolio income summary', 'Automated rent reminders', 'Everything in Free'],
    cta: 'Start Free Trial',
    ctaVariant: 'contained',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: '$50',
    period: '/ mo',
    description: 'For serious landlords with large or growing portfolios.',
    features: ['Unlimited properties', 'Employee accounts (coming soon)', 'AI features (coming soon)', 'Document signing (coming soon)', 'Everything in Starter'],
    cta: 'Get Started',
    ctaVariant: 'outlined',
    highlight: false,
    badge: null,
  },
]

// shared dark section styles
const darkBg = {
  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)',
  position: 'relative',
  overflow: 'hidden',
  '&:before': {
    content: '""',
    position: 'absolute', inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    pointerEvents: 'none',
  },
}

// ─── component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [faqOpen, setFaqOpen] = useState(null)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff' }}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <Box
        component="nav"
        sx={{
          position: 'sticky', top: 0, zIndex: 100,
          bgcolor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          py: 1.5,
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography
              variant="h6"
              fontWeight={800}
              sx={{ color: '#1976d2', letterSpacing: '-0.5px', userSelect: 'none' }}
            >
              LotLord
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                onClick={() => scrollTo('how-it-works')}
                size="small"
                sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                How It Works
              </Button>
              <Button
                onClick={() => scrollTo('pricing')}
                size="small"
                sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Pricing
              </Button>
              <Button
                onClick={() => scrollTo('faq')}
                size="small"
                sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                FAQ
              </Button>
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
      <Box sx={{ ...darkBg, minHeight: '92vh', display: 'flex', alignItems: 'center' }}>
        <Container maxWidth="md" sx={{ position: 'relative', textAlign: 'center', py: { xs: 10, md: 14 } }}>
          <Chip
            label="Free plan available · No credit card required"
            size="small"
            sx={{
              mb: 3,
              bgcolor: 'rgba(25,118,210,0.15)',
              color: '#90caf9',
              border: '1px solid rgba(25,118,210,0.3)',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
          <Typography
            variant="h1"
            fontWeight={800}
            sx={{
              fontSize: { xs: '2.4rem', md: '3.75rem' },
              lineHeight: 1.1,
              letterSpacing: '-2px',
              color: '#fff',
              mb: 3,
            }}
          >
            Property management
            <br />
            <Box
              component="span"
              sx={{
                background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              built for landlords
            </Box>
          </Typography>
          <Typography
            variant="h6"
            fontWeight={400}
            sx={{
              color: 'rgba(255,255,255,0.62)',
              mb: 5,
              maxWidth: 560,
              mx: 'auto',
              lineHeight: 1.7,
              fontSize: { xs: '1rem', md: '1.1rem' },
            }}
          >
            Rent collection, tenant management, maintenance tracking, and automated
            reminders — all under one roof. Free to start.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button
              component={RouterLink}
              to="/register"
              variant="contained"
              size="large"
              sx={{ px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700, borderRadius: 2 }}
            >
              Start for free →
            </Button>
            <Button
              onClick={() => scrollTo('how-it-works')}
              variant="outlined"
              size="large"
              sx={{
                px: 4, py: 1.5, fontSize: '1rem',
                borderColor: 'rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: 2,
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' },
              }}
            >
              See how it works
            </Button>
          </Stack>
          <Stack direction="row" spacing={3} justifyContent="center" mt={4} flexWrap="wrap">
            {['No credit card required', 'Free plan available', '5-minute setup'].map((t) => (
              <Stack key={t} direction="row" spacing={0.5} alignItems="center">
                <CheckIcon sx={{ fontSize: 14, color: '#4ade80' }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                  {t}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <Box id="how-it-works" sx={{ bgcolor: '#f8fafc', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography variant="overline" display="block" textAlign="center" color="primary" fontWeight={700} letterSpacing={2} mb={1}>
            How It Works
          </Typography>
          <Typography variant="h4" fontWeight={800} textAlign="center" letterSpacing="-0.5px" gutterBottom>
            Up and running in minutes
          </Typography>
          <Typography color="text.secondary" textAlign="center" mb={7} maxWidth={480} mx="auto">
            No onboarding call, no spreadsheet migration. Just sign up and go.
          </Typography>
          <Grid container spacing={4}>
            {STEPS.map((step) => (
              <Grid item xs={12} md={4} key={step.number}>
                <Stack spacing={2} alignItems="center" textAlign="center">
                  <Box
                    sx={{
                      width: 52, height: 52,
                      border: '2px solid',
                      borderColor: 'primary.main',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={800} color="primary">{step.number}</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={700}>{step.title}</Typography>
                  <Typography variant="body2" color="text.secondary" lineHeight={1.8}>{step.body}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <Box id="features" sx={{ bgcolor: '#fff', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography variant="overline" display="block" textAlign="center" color="primary" fontWeight={700} letterSpacing={2} mb={1}>
            Features
          </Typography>
          <Typography variant="h4" fontWeight={800} textAlign="center" letterSpacing="-0.5px" gutterBottom>
            Everything you need to run your rentals
          </Typography>
          <Typography color="text.secondary" textAlign="center" mb={7} maxWidth={480} mx="auto">
            Purpose-built for independent landlords. No bloat, no steep learning curve.
          </Typography>
          <Grid container spacing={3}>
            {FEATURES.map(({ Icon, title, body }) => (
              <Grid item xs={12} sm={6} md={4} key={title}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    '&:hover': { boxShadow: 4, transform: 'translateY(-3px)' },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box
                      sx={{
                        width: 44, height: 44, bgcolor: '#e3f2fd',
                        borderRadius: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        mb: 2,
                      }}
                    >
                      <Icon sx={{ color: 'primary.main', fontSize: 22 }} />
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} mb={0.5}>{title}</Typography>
                    <Typography variant="body2" color="text.secondary" lineHeight={1.8}>{body}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <Box id="pricing" sx={{ bgcolor: '#f8fafc', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography variant="overline" display="block" textAlign="center" color="primary" fontWeight={700} letterSpacing={2} mb={1}>
            Pricing
          </Typography>
          <Typography variant="h4" fontWeight={800} textAlign="center" letterSpacing="-0.5px" gutterBottom>
            Simple, transparent pricing
          </Typography>
          <Typography color="text.secondary" textAlign="center" mb={7} maxWidth={440} mx="auto">
            Start free. Pay only when your portfolio grows.
          </Typography>
          <Grid container spacing={3} justifyContent="center" alignItems="stretch">
            {PLANS.map((plan) => (
              <Grid item xs={12} sm={8} md={4} key={plan.name}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    ...(plan.highlight && { borderColor: 'primary.main', borderWidth: 2 }),
                  }}
                >
                  {plan.badge && (
                    <Box sx={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)' }}>
                      <Chip label={plan.badge} size="small" color="primary" sx={{ fontWeight: 700 }} />
                    </Box>
                  )}
                  <CardContent sx={{ p: 3.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography
                      variant="overline"
                      fontWeight={700}
                      sx={{ color: plan.highlight ? 'primary.main' : 'text.secondary' }}
                    >
                      {plan.name}
                    </Typography>
                    <Typography variant="h3" fontWeight={800} mt={0.5} mb={0.5}>
                      {plan.price}
                      <Typography component="span" variant="body2" color="text.secondary"> {plan.period}</Typography>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2.5}>
                      {plan.description}
                    </Typography>
                    <Divider sx={{ mb: 2.5 }} />
                    <Stack spacing={1.2} flex={1}>
                      {plan.features.map((f) => (
                        <Stack key={f} direction="row" spacing={1} alignItems="flex-start">
                          <CheckIcon fontSize="small" color="success" sx={{ mt: '2px', flexShrink: 0 }} />
                          <Typography variant="body2">{f}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    <Button
                      component={RouterLink}
                      to="/register"
                      variant={plan.ctaVariant}
                      fullWidth
                      sx={{ mt: 3 }}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Box id="faq" sx={{ bgcolor: '#fff', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="md">
          <Typography variant="overline" display="block" textAlign="center" color="primary" fontWeight={700} letterSpacing={2} mb={1}>
            FAQ
          </Typography>
          <Typography variant="h4" fontWeight={800} textAlign="center" letterSpacing="-0.5px" gutterBottom>
            Common questions
          </Typography>
          <Typography color="text.secondary" textAlign="center" mb={6} maxWidth={440} mx="auto">
            Still have questions? Reach out any time from your dashboard.
          </Typography>
          <Stack spacing={1}>
            {FAQ.map((item, i) => (
              <Accordion
                key={i}
                expanded={faqOpen === i}
                onChange={() => setFaqOpen(faqOpen === i ? null : i)}
                disableGutters
                elevation={0}
                variant="outlined"
                sx={{
                  borderRadius: '8px !important',
                  overflow: 'hidden',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ py: 1.5 }}>
                  <Typography fontWeight={600}>{item.q}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="body2" color="text.secondary" lineHeight={1.85}>
                    {item.a}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <Box sx={{ ...darkBg, py: { xs: 9, md: 13 }, textAlign: 'center' }}>
        <Container maxWidth="sm" sx={{ position: 'relative' }}>
          <Typography
            variant="h4"
            fontWeight={800}
            color="#fff"
            gutterBottom
            letterSpacing="-0.5px"
            sx={{ fontSize: { xs: '1.8rem', md: '2.25rem' } }}
          >
            Ready to take control of<br />your properties?
          </Typography>
          <Typography color="rgba(255,255,255,0.55)" mb={4}>
            Get started in minutes — free plan available, no credit card required.
          </Typography>
          <Button
            component={RouterLink}
            to="/register"
            variant="contained"
            size="large"
            sx={{ px: { xs: 3, sm: 5 }, py: 1.5, fontWeight: 700, fontSize: '1rem', borderRadius: 2, whiteSpace: 'nowrap' }}
          >
            Create your free account →
          </Button>
        </Container>
      </Box>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Box
        component="footer"
        sx={{
          bgcolor: '#0f172a',
          color: 'rgba(255,255,255,0.45)',
          py: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} mb={4}>
            <Grid item xs={12} md={5}>
              <Typography variant="h6" fontWeight={800} color="#fff" mb={1} letterSpacing="-0.5px">
                LotLord
              </Typography>
              <Typography variant="body2" lineHeight={1.8} maxWidth={300}>
                The modern property management platform for independent landlords.
                Collect rent, manage tenants, and grow your portfolio — all in one place.
              </Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography
                variant="subtitle2"
                fontWeight={700}
                color="rgba(255,255,255,0.6)"
                mb={1.5}
                textTransform="uppercase"
                letterSpacing={1}
                fontSize="0.7rem"
              >
                Product
              </Typography>
              <Stack spacing={1}>
                {[
                  { label: 'Features',    onClick: () => scrollTo('features') },
                  { label: 'Pricing',     onClick: () => scrollTo('pricing') },
                  { label: 'FAQ',         onClick: () => scrollTo('faq') },
                  { label: 'Log In',      to: '/login' },
                  { label: 'Get Started', to: '/register' },
                ].map((item) =>
                  item.to ? (
                    <Typography
                      key={item.label}
                      component={RouterLink}
                      to={item.to}
                      variant="body2"
                      sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: '#fff' } }}
                    >
                      {item.label}
                    </Typography>
                  ) : (
                    <Typography
                      key={item.label}
                      variant="body2"
                      onClick={item.onClick}
                      sx={{ cursor: 'pointer', color: 'inherit', '&:hover': { color: '#fff' } }}
                    >
                      {item.label}
                    </Typography>
                  ),
                )}
              </Stack>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography
                variant="subtitle2"
                fontWeight={700}
                color="rgba(255,255,255,0.6)"
                mb={1.5}
                textTransform="uppercase"
                letterSpacing={1}
                fontSize="0.7rem"
              >
                Legal
              </Typography>
              <Stack spacing={1}>
                {[
                  { label: 'Terms of Service', to: '/terms' },
                  { label: 'Privacy Policy',   to: '/privacy' },
                ].map(({ label, to }) => (
                  <Typography
                    key={to}
                    component={RouterLink}
                    to={to}
                    variant="body2"
                    sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: '#fff' } }}
                  >
                    {label}
                  </Typography>
                ))}
              </Stack>
            </Grid>
          </Grid>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 3 }} />
          <Typography variant="caption">
            © {new Date().getFullYear()} LotLord. All rights reserved.
          </Typography>
        </Container>
      </Box>

    </Box>
  )
}
