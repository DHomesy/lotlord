import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  TextField, Stack, Button, Alert, Typography,
  Card, CardContent, CardActionArea, Divider, Box, CircularProgress, Chip, Grid,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CardMembershipIcon from '@mui/icons-material/CardMembership'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import HistoryIcon from '@mui/icons-material/History'
import PeopleIcon from '@mui/icons-material/People'
import PageContainer from '../../components/layout/PageContainer'
import { useAuthStore } from '../../store/authStore'
import { useUpdateMe, useChangePassword } from '../../hooks/useUsers'
import { useConnectStatus, useConnectOnboard, useConnectLogin } from '../../hooks/useStripeSetup'
import { useMySubscription, useCreateCheckoutSession, useCreateBillingPortalSession } from '../../hooks/useBilling'
import { PLANS, hasStarter, hasCommercial } from '../../lib/plans'

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
  const navigate   = useNavigate()
  const isAdmin    = user?.role === 'admin'
  const isLandlord = user?.role === 'landlord'
  const isEmployee = user?.role === 'employee'

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
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const subscriptionRef = useRef(null)

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
    if (params.get('upgrade') === '1') {
      setShowUpgradePrompt(true)
      window.history.replaceState({}, '', window.location.pathname)
      // Scroll after a short delay to allow the page to render
      setTimeout(() => subscriptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
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

      {/* ── Connect onboarding prompt — shown until landlord completes payout setup ── */}
      {isLandlord && connectStatus && !connectStatus.onboarded && (
        <Alert
          severity="warning"
          icon={<AccountBalanceIcon />}
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={handleStartOnboard}
              disabled={onboarding}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {onboarding ? 'Redirecting…' : connectStatus.connected ? 'Continue Setup' : 'Set Up Payouts'}
            </Button>
          }
        >
          <strong>Action required: Set up your payout account.</strong>{' '}
          Before tenants can pay rent online, you need to connect your bank account via Stripe.
        </Alert>
      )}


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

      {/* ── Admin Account (admin only) ── */}
      {isAdmin && (
        <>
          <Divider sx={{ my: 4 }} />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <AdminPanelSettingsIcon color="primary" />
            <Typography variant="h6">Admin Account</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your account has unrestricted access to all features and plan tiers. Subscription and
            billing checks are bypassed for admin.
          </Typography>
          <Grid container spacing={2} sx={{ maxWidth: 600 }}>
            {[
              { label: 'User Management',  desc: 'Create and manage user accounts',   icon: <ManageAccountsIcon color="action" />, path: '/users' },
              { label: 'Audit Log',        desc: 'Review all system activity',         icon: <HistoryIcon color="action" />,        path: '/audit' },
              { label: 'Subscriptions',    desc: 'View landlord subscription statuses', icon: <CardMembershipIcon color="action" />, path: '/subscriptions' },
              { label: 'Team Members',     desc: 'Manage employee invitations',         icon: <PeopleIcon color="action" />,         path: '/team' },
            ].map(({ label, desc, icon, path }) => (
              <Grid item xs={12} sm={6} key={path}>
                <Card variant="outlined" sx={{ height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
                  <CardActionArea onClick={() => navigate(path)} sx={{ p: 2, height: '100%', alignItems: 'flex-start', display: 'flex' }}>
                    <CardContent sx={{ p: '0 !important' }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
                        {icon}
                        <Typography variant="body2" fontWeight={600}>{label}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{desc}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* ── Employee info (employee only) ── */}
      {isEmployee && (
        <>
          <Divider sx={{ my: 4 }} />
          <Alert severity="info" sx={{ maxWidth: 460 }}>
            You are a team member operating under your employer&apos;s account. Billing, payout
            settings, and subscription management are handled by your employer.
          </Alert>
        </>
      )}

      {/* ── Payout Setup (landlord only — Stripe Connect Express) ── */}
      {isLandlord && (<>
      <Divider sx={{ my: 4 }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
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
      <Divider sx={{ my: 4 }} ref={subscriptionRef} />

      {showUpgradePrompt && !hasStarter(subscription) && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setShowUpgradePrompt(false)}>
          Choose a plan below to unlock analytics, more properties, and additional features.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6">Subscription</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Choose a plan to unlock additional features. Manage your payment method or
            download invoices at any time.
          </Typography>
        </Box>
        <Chip
          icon={<CardMembershipIcon />}
          label={subscription?.plan ? subscription.plan : (subscription?.status ?? 'free')}
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
        <Alert severity="success" sx={{ maxWidth: 560, mt: 1 }} onClose={() => setBillingBanner(null)}>
          You’re subscribed! Your plan is now active.
        </Alert>
      )}
      {billingBanner === 'canceled' && (
        <Alert severity="info" sx={{ maxWidth: 560, mt: 1 }} onClose={() => setBillingBanner(null)}>
          Checkout canceled — you have not been charged.
        </Alert>
      )}

      {/* past_due warning */}
      {subscription?.status === 'past_due' && (
        <Alert severity="warning" sx={{ maxWidth: 560, mt: 1 }}>
          Your last payment failed. Please update your payment method to restore full access.
        </Alert>
      )}

      {/* Plan picker — shown when not subscribed (or canceled) */}
      {(!subscription?.status || subscription.status === 'none' || subscription.status === 'canceled') && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2, maxWidth: 720 }}>
          {Object.values(PLANS).map(({ key, label, price, unitAddon, description, features }) => (
            <Card
              key={key}
              variant="outlined"
              sx={{
                flex: 1,
                transition: 'border-color 0.15s',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700}>{label}</Typography>
                <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ my: 0.5 }}>
                  ${price}<Typography component="span" variant="caption" color="text.secondary">/mo{unitAddon ? ` + $${unitAddon}/unit` : ''}</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {description}
                </Typography>
                {features.map((f) => (
                  <Typography key={f} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    ✓ {f}
                  </Typography>
                ))}
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  sx={{ mt: 2 }}
                  disabled={startingCheckout}
                  onClick={() => startCheckout(key)}
                >
                  {startingCheckout ? 'Redirecting…' : `Subscribe to ${label}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Active/trialing: show current plan + manage button */}
      {hasStarter(subscription) && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Current plan: <strong style={{ textTransform: 'capitalize' }}>{subscription?.plan ?? 'active'}</strong>
          </Typography>
          {hasCommercial(subscription) && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Your Commercial plan includes an automatic $2/unit/mo add-on for each commercial unit across all your properties. The add-on quantity is updated in real-time as you add or remove units.
            </Typography>
          )}
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => openPortal()}
            disabled={openingPortal}
          >
            {openingPortal ? 'Loading…' : 'Manage Subscription'}
          </Button>
        </Box>
      )}
      </>)}
    </PageContainer>
  )
}
