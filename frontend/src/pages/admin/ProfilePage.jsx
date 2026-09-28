import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  TextField, Stack, Button, Alert, Typography,
  Card, CardContent, CardActionArea, Divider, Grid,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CardMembershipIcon from '@mui/icons-material/CardMembership'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import HistoryIcon from '@mui/icons-material/History'
import PeopleIcon from '@mui/icons-material/People'
import PageContainer from '../../components/layout/PageContainer'
import { useAuthStore } from '../../store/authStore'
import { useUpdateMe, useChangePassword } from '../../hooks/useUsers'
import { useConnectStatus } from '../../hooks/useStripeSetup'
import { useMySubscription } from '../../hooks/useBilling'
import { hasStarter } from '../../lib/plans'

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'Min 8 characters'),
})

export default function AdminProfilePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const isLandlord = user?.role === 'landlord'
  const isEmployee = user?.role === 'employee'

  const { mutate: updateMe, isPending: savingProfile, isSuccess: profileSaved } = useUpdateMe()
  const { mutate: changePassword, isPending: changingPw, isSuccess: pwChanged, isError: pwError } = useChangePassword()
  const { data: connectStatus } = useConnectStatus()
  const { data: subscription } = useMySubscription()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connect = params.get('connect')
    if (connect === 'success' || connect === 'refresh') {
      navigate(`/payments?tab=payouts&connect=${connect}`, { replace: true })
      return
    }
    const billing = params.get('billing')
    if (billing === 'success' || billing === 'canceled') {
      navigate(`/payments?billing=${billing}`, { replace: true })
      return
    }
    if (params.get('upgrade') === '1') {
      navigate('/payments', { replace: true })
    }
  }, [navigate])

  function handleStartOnboard() {
    navigate('/payments?tab=payouts')
  }

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', phone: user?.phone || '' },
  })
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema) })

  return (
    <PageContainer title="My Profile">
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
              sx={{ whiteSpace: 'nowrap' }}
            >
              {connectStatus.connected ? 'Continue Setup' : 'Set Up Payouts'}
            </Button>
          }
        >
          <strong>Action required: Set up your payout account.</strong>{' '}
          Before tenants can pay rent online, you need to connect your bank account via Stripe.
        </Alert>
      )}

      {isLandlord && subscription !== undefined && !hasStarter(subscription) && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() => navigate('/payments')}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Upgrade Plan
            </Button>
          }
        >
          You&apos;re on the <strong>Free plan</strong>. Upgrade to Paid ($10/mo) to unlock higher limits.
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
          {savingProfile ? 'Saving...' : 'Save Profile'}
        </Button>
      </Stack>

      <Divider sx={{ mb: 3 }} />
      <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
      {pwChanged && <Alert severity="success" sx={{ mb: 2 }}>Password changed!</Alert>}
      {pwError && <Alert severity="error" sx={{ mb: 2 }}>Incorrect current password.</Alert>}
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
          {changingPw ? 'Saving...' : 'Change Password'}
        </Button>
      </Stack>

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
              { label: 'User Management', desc: 'Create and manage user accounts', icon: <ManageAccountsIcon color="action" />, path: '/users' },
              { label: 'Audit Log', desc: 'Review all system activity', icon: <HistoryIcon color="action" />, path: '/audit' },
              { label: 'Subscriptions', desc: 'View landlord subscription statuses', icon: <CardMembershipIcon color="action" />, path: '/subscriptions' },
              { label: 'Team Members', desc: 'Manage employee invitations', icon: <PeopleIcon color="action" />, path: '/team' },
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

      {isEmployee && (
        <>
          <Divider sx={{ my: 4 }} />
          <Alert severity="info" sx={{ maxWidth: 460 }}>
            You are a team member operating under your employer&apos;s account. Billing, payout
            settings, and subscription management are handled by your employer.
          </Alert>
        </>
      )}
    </PageContainer>
  )
}
