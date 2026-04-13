import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  TextField, Stack, Button, Alert, Typography,
  Card, CardContent, Divider, Box, CircularProgress, Chip,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CardMembershipIcon from '@mui/icons-material/CardMembership'
import PageContainer from '../../components/layout/PageContainer'
import { useAuthStore } from '../../store/authStore'
import { useUpdateMe, useChangePassword } from '../../hooks/useUsers'
import { useConnectStatus, useConnectOnboard, useConnectLogin } from '../../hooks/useStripeSetup'
import { useMySubscription, useCreateCheckoutSession, useCreateBillingPortalSession } from '../../hooks/useBilling'

const profileSchema = z.object({
  name:  z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password:     z.string().min(8, 'Min 8 characters'),
})

export default function AdminProfilePage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin    = user?.role === 'admin'
  const isLandlord = user?.role === 'landlord'

  const { mutate: updateMe,       isPending: savingProfile, isSuccess: profileSaved }               = useUpdateMe()
  const { mutate: changePassword, isPending: changingPw,   isSuccess: pwChanged, isError: pwError } = useChangePassword()
  const { data: connectStatus }       = useConnectStatus()
  const { mutate: startOnboard, isPending: onboarding, error: onboardError } = useConnectOnboard()
  const { mutate: openDashboard, isPending: openingDashboard } = useConnectLogin()
  const { data: subscription }                                                = useMySubscription()
  const { mutate: startCheckout,  isPending: startingCheckout  }             = useCreateCheckoutSession()
  const { mutate: openPortal,     isPending: openingPortal     }             = useCreateBillingPortalSession()
  const [connectBanner,  setConnectBanner]  = useState(null) // 'success' | 'refresh' | null
  const [billingBanner,  setBillingBanner]  = useState(null) // 'success' | 'canceled' | null

  // Detect return from Stripe Connect onboarding redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connect = params.get('connect')
    if (connect === 'success' || connect === 'refresh') {
      setConnectBanner(connect)
      window.history.replaceState({}, '', window.location.pathname)
    }
    const billing = params.get('billing')
    if (billing === 'success' || billing === 'canceled') {
      setBillingBanner(billing)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function handleStartOnboard() {
    startOnboard(undefined, {
      onSuccess: (data) => { window.location.href = data.url },
    })
  }

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', phone: user?.phone || '' },
  })
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema) })

  return (
    <PageContainer title="My Profile">

      {/* ── Profile ── */}
      <Typography variant="h6" sx={{ mb: 2 }}>Profile</Typography>
      {profileSaved && <Alert severity="success" sx={{ mb: 2 }}>Saved!</Alert>}
      <Stack component="form" onSubmit={profileForm.handleSubmit(updateMe)} spacing={2} sx={{ maxWidth: 440, mb: 5 }}>
        <TextField
          label="Name"
          {...profileForm.register('name')}
          error={!!profileForm.formState.errors.name}
          helperText={profileForm.formState.errors.name?.message}
        />
        <TextField label="Phone" {...profileForm.register('phone')} />
        <Button type="submit" variant="contained" disabled={savingProfile} sx={{ alignSelf: 'flex-start' }}>
          {savingProfile ? 'Saving…' : 'Save Profile'}
        </Button>
      </Stack>

      {/* ── Change Password ── */}
      <Divider sx={{ mb: 3 }} />
      <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
      {pwChanged && <Alert severity="success" sx={{ mb: 2 }}>Password changed!</Alert>}
      {pwError   && <Alert severity="error"   sx={{ mb: 2 }}>Incorrect current password.</Alert>}
      <Stack component="form" onSubmit={passwordForm.handleSubmit(changePassword)} spacing={2} sx={{ maxWidth: 440 }}>
        <TextField
          label="Current Password"
          type="password"
          {...passwordForm.register('current_password')}
          error={!!passwordForm.formState.errors.current_password}
          helperText={passwordForm.formState.errors.current_password?.message}
        />
        <TextField
          label="New Password"
          type="password"
          {...passwordForm.register('new_password')}
          error={!!passwordForm.formState.errors.new_password}
          helperText={passwordForm.formState.errors.new_password?.message}
        />
        <Button type="submit" variant="contained" disabled={changingPw} sx={{ alignSelf: 'flex-start' }}>
          {changingPw ? 'Saving…' : 'Change Password'}
        </Button>
      </Stack>

      {/* ── Payout Setup (landlord only — Stripe Connect Express) ── */}
      {isLandlord && (<>
      <Divider sx={{ my: 4 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6">Payout Account</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Connect your bank account so rent payments from tenants are deposited directly to you.
            Stripe handles secure bank verification and payouts (0.8% fee, capped at $5 per payment).
          </Typography>
        </Box>
        {connectStatus?.onboarded ? (
          <Chip
            icon={<CheckCircleIcon />}
            label="Connected"
            color="success"
            variant="outlined"
            sx={{ ml: 2, flexShrink: 0 }}
          />
        ) : (
          <Button
            variant="contained"
            size="small"
            startIcon={onboarding ? <CircularProgress size={14} color="inherit" /> : <AccountBalanceIcon />}
            onClick={handleStartOnboard}
            disabled={onboarding}
            sx={{ ml: 2, flexShrink: 0 }}
          >
            {onboarding ? 'Redirecting…' : connectStatus?.connected ? 'Continue Setup' : 'Setup Payouts'}
          </Button>
        )}
      </Stack>

      {/* Return from Stripe banners */}
      {connectBanner === 'success' && (
        <Alert severity="success" sx={{ maxWidth: 460, mt: 1 }} onClose={() => setConnectBanner(null)}>
          Payout account setup complete! Rent payments will now be deposited to your bank.
        </Alert>
      )}
      {connectBanner === 'refresh' && (
        <Alert severity="info" sx={{ maxWidth: 460, mt: 1 }} onClose={() => setConnectBanner(null)}>
          The setup link expired. Click "Continue Setup" to resume where you left off.
        </Alert>
      )}
      {onboardError && (
        <Alert severity="error" sx={{ maxWidth: 460, mt: 1 }}>
          {onboardError?.response?.data?.error ?? 'Failed to start payout setup. Please try again.'}
        </Alert>
      )}

      {/* Status details when connected but not fully complete */}
      {connectStatus?.connected && !connectStatus?.onboarded && !connectBanner && (
        <Alert severity="warning" sx={{ maxWidth: 460, mt: 1 }}>
          Setup incomplete — click "Continue Setup" to finish verifying your account so payouts can be enabled.
        </Alert>
      )}

      {connectStatus?.onboarded && (
        <Stack spacing={1} sx={{ maxWidth: 460, mt: 2 }}>
          <Card variant="outlined">
            <CardContent sx={{ py: '8px !important', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CheckCircleIcon fontSize="small" color="success" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={500}>Bank account verified</Typography>
                <Typography variant="caption" color="text.secondary">
                  Payouts {connectStatus.payoutsEnabled ? 'enabled' : 'pending activation'}
                </Typography>
              </Box>
              <Button
                size="small"
                endIcon={<OpenInNewIcon fontSize="small" />}
                onClick={() => openDashboard(undefined, { onSuccess: (d) => { window.location.href = d.url } })}
                disabled={openingDashboard}
              >
                {openingDashboard ? 'Loading…' : 'Manage'}
              </Button>
            </CardContent>
          </Card>
        </Stack>
      )}
      </>)}

      {/* ── Subscription (landlord only — SaaS plan) ── */}
      {isLandlord && (<>
      <Divider sx={{ my: 4 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6">Subscription</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Your platform subscription gives you access to all PropertyMgr features.
            Manage your plan, update your payment method, or download invoices at any time.
          </Typography>
        </Box>
        <Chip
          icon={<CardMembershipIcon />}
          label={subscription?.status ?? 'none'}
          color={
            subscription?.status === 'active'   ? 'success' :
            subscription?.status === 'trialing' ? 'info' :
            subscription?.status === 'past_due' ? 'warning' :
            subscription?.status === 'canceled' ? 'error' : 'default'
          }
          variant="outlined"
          sx={{ ml: 2, flexShrink: 0, textTransform: 'capitalize' }}
        />
      </Stack>

      {/* Return from Stripe Checkout */}
      {billingBanner === 'success' && (
        <Alert severity="success" sx={{ maxWidth: 460, mt: 1 }} onClose={() => setBillingBanner(null)}>
          You’re subscribed! Your plan is now active.
        </Alert>
      )}
      {billingBanner === 'canceled' && (
        <Alert severity="info" sx={{ maxWidth: 460, mt: 1 }} onClose={() => setBillingBanner(null)}>
          Checkout canceled — you have not been charged.
        </Alert>
      )}

      {/* past_due warning */}
      {subscription?.status === 'past_due' && (
        <Alert severity="warning" sx={{ maxWidth: 460, mt: 1 }}>
          Your last payment failed. Please update your payment method to restore full access.
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {(!subscription?.status || subscription.status === 'none' || subscription.status === 'canceled') && (
          <Button
            variant="contained"
            startIcon={startingCheckout ? <CircularProgress size={14} color="inherit" /> : <CardMembershipIcon />}
            onClick={() => startCheckout()}
            disabled={startingCheckout}
          >
            {startingCheckout ? 'Redirecting…' : 'Subscribe'}
          </Button>
        )}
        {subscription?.status && subscription.status !== 'none' && subscription.status !== 'canceled' && (
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => openPortal()}
            disabled={openingPortal}
          >
            {openingPortal ? 'Loading…' : 'Manage Subscription'}
          </Button>
        )}
      </Stack>

      {subscription?.plan && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Current plan: {subscription.plan}
        </Typography>
      )}
      </>)}
    </PageContainer>
  )
}
