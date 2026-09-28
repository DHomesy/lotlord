import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PageContainer from '../../components/layout/PageContainer'
import ConnectPayoutsPanel from '../../components/billing/ConnectPayoutsPanel'
import BillingPaymentMethodDialog from '../../components/billing/BillingPaymentMethodDialog'
import EmbeddedSubscriptionCheckout from '../../components/billing/EmbeddedSubscriptionCheckout'
import { useAuthStore } from '../../store/authStore'
import { useConnectStatus } from '../../hooks/useStripeSetup'
import {
  SUBSCRIPTION_KEY,
  useCreateBillingPortalSession,
  useCreateCheckoutSession,
  useCancelSubscription,
  useCompleteBillingPaymentMethod,
  useMySubscription,
  useReactivateSubscription,
} from '../../hooks/useBilling'
import { useQueryClient } from '@tanstack/react-query'
import { hasStarter, PLANS } from '../../lib/plans'

const STATUS_COLOR = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'error',
}

function SubscriptionPanel({ subscription, isLoading, onCheckoutComplete, onBillingUpdated }) {
  const paid = hasStarter(subscription)
  const plan = PLANS.starter
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const { mutate: openPortal, isPending: openingPortal, error: portalError } = useCreateBillingPortalSession()
  const { mutate: openHostedCheckout, isPending: openingCheckout } = useCreateCheckoutSession()
  const { mutate: cancelSubscription, isPending: canceling, error: cancelError } = useCancelSubscription()
  const { mutate: reactivateSubscription, isPending: reactivating, error: reactivateError } = useReactivateSubscription()
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  if (isLoading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading billing details...</Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h6">Plan and billing</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage your LotLord subscription without leaving your workspace.
        </Typography>
      </Box>

      {subscription?.status === 'past_due' && (
        <Alert severity="warning">
          Your latest subscription payment failed. Update your billing details to restore paid access.
        </Alert>
      )}
      {portalError && (
        <Alert severity="error">
          {portalError?.response?.data?.error ?? 'Could not open billing management.'}
        </Alert>
      )}
      {(cancelError || reactivateError) && (
        <Alert severity="error">
          {cancelError?.response?.data?.error ?? reactivateError?.response?.data?.error ?? 'Could not update the subscription.'}
        </Alert>
      )}
      {subscription?.cancelAtPeriodEnd && (
        <Alert severity="warning">
          Your subscription is scheduled to end{periodEnd ? ` on ${periodEnd}` : ' at the end of the billing period'}.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <Typography variant="h6">{paid ? 'Paid' : 'Free'}</Typography>
              <Chip
                size="small"
                label={paid ? (subscription?.status ?? 'active') : 'current'}
                color={paid ? (STATUS_COLOR[subscription?.status] ?? 'default') : 'default'}
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {paid
                ? '$10 per month with expanded portfolio access.'
                : 'Up to 2 properties and 4 units per property.'}
            </Typography>
          </Box>
          <Typography variant="h4" fontWeight={800}>
            ${paid ? plan.price : 0}
            <Typography component="span" variant="body2" color="text.secondary"> / month</Typography>
          </Typography>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        {!paid ? (
          <Grid container spacing={2}>
            {plan.features.map((feature) => (
              <Grid item xs={12} sm={6} key={feature}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleIcon color="success" fontSize="small" />
                  <Typography variant="body2">{feature}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography variant="body2">Paid portfolio limits are active.</Typography>
          </Stack>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
          {!paid && subscription?.status !== 'past_due' && (
            <Button
              variant="contained"
              startIcon={<CreditCardIcon />}
              onClick={() => setCheckoutOpen(true)}
            >
              Upgrade securely
            </Button>
          )}
          {(paid || subscription?.status === 'past_due') && (
            <Button
              variant="contained"
              startIcon={<CreditCardIcon />}
              onClick={() => setPaymentMethodOpen(true)}
            >
              Update payment method
            </Button>
          )}
          {paid && subscription?.cancelAtPeriodEnd && (
            <Button
              variant="outlined"
              onClick={() => reactivateSubscription(undefined, { onSuccess: onBillingUpdated })}
              disabled={reactivating}
            >
              {reactivating ? 'Reactivating...' : 'Keep subscription'}
            </Button>
          )}
          {paid && !subscription?.cancelAtPeriodEnd && (
            <Button color="error" variant="outlined" onClick={() => setCancelOpen(true)}>
              Cancel subscription
            </Button>
          )}
          {!paid && subscription?.status !== 'past_due' && (
            <Button
              variant="text"
              size="small"
              endIcon={<OpenInNewIcon />}
              onClick={() => openHostedCheckout()}
              disabled={openingCheckout}
            >
              {openingCheckout ? 'Opening...' : 'Use Stripe checkout instead'}
            </Button>
          )}
        </Stack>

        {(paid || subscription?.status === 'past_due') && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1.5}
            >
              <Box>
                <Typography variant="subtitle2">Subscription payment method</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                  {subscription?.paymentMethod?.type === 'card'
                    ? `${subscription.paymentMethod.brand} ending in ${subscription.paymentMethod.last4}, expires ${subscription.paymentMethod.expiresMonth}/${subscription.paymentMethod.expiresYear}`
                    : 'No saved card details available'}
                </Typography>
              </Box>
              <Button
                variant="text"
                size="small"
                endIcon={<OpenInNewIcon />}
                onClick={() => openPortal()}
                disabled={openingPortal}
              >
                {openingPortal ? 'Opening...' : 'Stripe billing fallback'}
              </Button>
            </Stack>
          </>
        )}
      </Paper>

      <Alert icon={<LockOutlinedIcon />} severity="info">
        Card and billing details are entered in Stripe-secured fields embedded in LotLord. LotLord never stores raw card data.
      </Alert>

      <EmbeddedSubscriptionCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onComplete={onCheckoutComplete}
      />
      <BillingPaymentMethodDialog
        open={paymentMethodOpen}
        onClose={() => setPaymentMethodOpen(false)}
        onSuccess={() => {
          setPaymentMethodOpen(false)
          onBillingUpdated('Payment method updated.')
        }}
      />
      <Dialog open={cancelOpen} onClose={canceling ? undefined : () => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel paid subscription?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Paid access will continue{periodEnd ? ` through ${periodEnd}` : ' through the current billing period'}.
            You can reactivate before then without checking out again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)} disabled={canceling}>Keep plan</Button>
          <Button
            color="error"
            variant="contained"
            disabled={canceling}
            onClick={() => cancelSubscription(undefined, {
              onSuccess: () => {
                setCancelOpen(false)
                onBillingUpdated('Cancellation scheduled.')
              },
            })}
          >
            {canceling ? 'Scheduling...' : 'Cancel at period end'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default function PaymentsPage() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') === 'payouts' ? 1 : 0
  const [tab, setTab] = useState(requestedTab)
  const [checkoutCompleted, setCheckoutCompleted] = useState(searchParams.get('checkout') === 'return')
  const [billingMessage, setBillingMessage] = useState(null)
  const { mutate: completeBillingSetup } = useCompleteBillingPaymentMethod()
  const { data: subscription, isLoading: loadingSubscription } = useMySubscription({
    refetchInterval: (query) => (
      checkoutCompleted && !hasStarter(query.state.data) ? 2000 : false
    ),
  })
  const { data: connectStatus } = useConnectStatus()

  useEffect(() => {
    if (searchParams.get('checkout') !== 'return') return
    queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY })
    setSearchParams({}, { replace: true })
  }, [queryClient, searchParams, setSearchParams])

  useEffect(() => {
    if (searchParams.get('billing_setup') !== 'return') return
    const setupIntentId = searchParams.get('setup_intent')
    if (!setupIntentId) return
    completeBillingSetup(setupIntentId, {
      onSuccess: () => setBillingMessage('Payment method updated.'),
      onError: (error) => setBillingMessage(error?.response?.data?.error ?? 'Payment method setup could not be completed.'),
      onSettled: () => setSearchParams({}, { replace: true }),
    })
  }, [completeBillingSetup, searchParams, setSearchParams])

  if (user?.role !== 'landlord') return <Navigate to="/profile" replace />

  function handleTabChange(_event, value) {
    setTab(value)
    setSearchParams(value === 1 ? { tab: 'payouts' } : {}, { replace: true })
  }

  function handleCheckoutComplete() {
    setCheckoutCompleted(true)
    queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY })
  }

  function clearReturnStatus(name) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(name)
    setSearchParams(nextParams, { replace: true })
  }

  const paid = hasStarter(subscription)
  const connectReturn = searchParams.get('connect')
  const billingReturn = searchParams.get('billing')

  return (
    <PageContainer title="Payments & Billing">
      {checkoutCompleted && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCheckoutCompleted(false)}>
          Payment received. Your paid access will appear as soon as Stripe confirms the subscription.
        </Alert>
      )}
      {billingMessage && (
        <Alert severity={billingMessage === 'Payment method updated.' ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setBillingMessage(null)}>
          {billingMessage}
        </Alert>
      )}
      {connectReturn === 'success' && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => clearReturnStatus('connect')}>
          Payout account setup complete. Stripe will enable payouts after verification finishes.
        </Alert>
      )}
      {connectReturn === 'refresh' && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => clearReturnStatus('connect')}>
          The Stripe setup link expired. Continue setup below to resume where you left off.
        </Alert>
      )}
      {billingReturn === 'success' && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => clearReturnStatus('billing')}>
          Subscription checkout completed. Paid access will appear after Stripe confirms payment.
        </Alert>
      )}
      {billingReturn === 'canceled' && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => clearReturnStatus('billing')}>
          Checkout canceled. You have not been charged.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CreditCardIcon color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary">Subscription</Typography>
                <Typography variant="subtitle1" fontWeight={700}>
                  {paid ? 'Paid, $10/month' : 'Free plan'}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <AccountBalanceIcon color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary">Rent payouts</Typography>
                <Typography variant="subtitle1" fontWeight={700}>
                  {connectStatus?.onboarded ? 'Ready to receive funds' : 'Setup required'}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={handleTabChange} aria-label="Payment settings" sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab icon={<CreditCardIcon />} iconPosition="start" label="Plan & Billing" />
        <Tab icon={<AccountBalanceIcon />} iconPosition="start" label="Rent Payouts" />
      </Tabs>

      <Box sx={{ maxWidth: 960 }}>
        {tab === 0 && (
          <SubscriptionPanel
            subscription={subscription}
            isLoading={loadingSubscription}
            onCheckoutComplete={handleCheckoutComplete}
            onBillingUpdated={setBillingMessage}
          />
        )}
        {tab === 1 && <ConnectPayoutsPanel />}
      </Box>
    </PageContainer>
  )
}

