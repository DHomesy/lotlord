import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Stack, Box, MobileStepper,
  List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material'
import ApartmentIcon       from '@mui/icons-material/Apartment'
import PeopleIcon          from '@mui/icons-material/People'
import PaymentsIcon        from '@mui/icons-material/Payments'
import BuildIcon           from '@mui/icons-material/Build'
import AccountBalanceIcon  from '@mui/icons-material/AccountBalance'
import KeyboardArrowRight  from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowLeft   from '@mui/icons-material/KeyboardArrowLeft'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'

const STEPS = [
  {
    title: 'Welcome to LotLord 👋',
    content: (
      <Stack spacing={2}>
        <Typography color="text.secondary">
          Here's everything you can do once you're set up:
        </Typography>
        <List dense disablePadding>
          {[
            [ApartmentIcon,   'Manage properties & units'],
            [PeopleIcon,      'Invite tenants and track leases'],
            [PaymentsIcon,    'Collect rent online via Stripe'],
            [BuildIcon,       'Handle maintenance requests'],
          ].map(([Icon, text]) => (
            <ListItem key={text} disableGutters sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText primary={text} />
            </ListItem>
          ))}
        </List>
      </Stack>
    ),
  },
  {
    title: 'Connect your bank',
    content: (
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <AccountBalanceIcon sx={{ fontSize: 48, color: 'primary.main' }} />
        </Box>
        <Typography color="text.secondary">
          To receive rent payments directly to your bank account, connect via Stripe Connect.
          It only takes a few minutes.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Head to <strong>Profile → Stripe Payouts</strong> whenever you're ready.
        </Typography>
      </Stack>
    ),
  },
  {
    title: 'Add your first property',
    content: (
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main' }} />
        </Box>
        <Typography color="text.secondary">
          You're all set! Start by adding your first property — give it a nickname, enter the
          address, and choose the property type. You can add units right after.
        </Typography>
      </Stack>
    ),
  },
]

const DEFAULT_STORAGE_KEY = 'll_onboarding_done'

export default function OnboardingWizard({ open, onClose, onAddProperty, storageKey = DEFAULT_STORAGE_KEY }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()

  const handleFinish = () => {
    localStorage.setItem(storageKey, '1')
    onClose()
  }

  const handleGoToProfile = () => {
    localStorage.setItem(storageKey, '1')
    onClose()
    navigate('/profile')
  }

  const handleAddProperty = () => {
    localStorage.setItem(storageKey, '1')
    onClose()
    if (onAddProperty) onAddProperty()
  }

  const isLast = step === STEPS.length - 1

  return (
    <Dialog open={open} onClose={handleFinish} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{STEPS[step].title}</DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        {STEPS[step].content}
      </DialogContent>

      <Box sx={{ px: 3, pb: 0.5 }}>
        <MobileStepper
          variant="dots"
          steps={STEPS.length}
          position="static"
          activeStep={step}
          sx={{ bgcolor: 'transparent', p: 0 }}
          nextButton={<Box />}
          backButton={<Box />}
        />
      </Box>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, gap: 1, flexWrap: 'wrap' }}>
        {step > 0 && (
          <Button
            size="small"
            startIcon={<KeyboardArrowLeft />}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <Button size="small" onClick={handleFinish} color="inherit">
          Skip
        </Button>

        {/* Step-specific CTAs */}
        {step === 1 && (
          <Button size="small" variant="outlined" onClick={handleGoToProfile}>
            Go to Profile
          </Button>
        )}
        {isLast ? (
          <Button variant="contained" onClick={handleAddProperty}>
            Add Property
          </Button>
        ) : (
          <Button variant="contained" endIcon={<KeyboardArrowRight />} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
