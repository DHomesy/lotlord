import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  ConnectAccountManagement,
  ConnectAccountOnboarding,
  ConnectBalances,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayouts,
} from '@stripe/react-connect-js'
import { useQueryClient } from '@tanstack/react-query'
import { createConnectAccountSession } from '../../api/payments'
import { useConnectLogin, useConnectOnboard, useConnectStatus } from '../../hooks/useStripeSetup'
import { useAuthStore } from '../../store/authStore'
import { getStripeConnectInstance, resetStripeConnectInstance } from '../../lib/stripeConnect'

async function fetchConnectClientSecret() {
  const { clientSecret } = await createConnectAccountSession()
  return clientSecret
}

export default function ConnectPayoutsPanel() {
  const queryClient = useQueryClient()
  const { data: status, isLoading } = useConnectStatus()
  const { mutate: openHostedOnboarding, isPending: openingOnboarding } = useConnectOnboard()
  const { mutate: openExpressDashboard, isPending: openingDashboard } = useConnectLogin()
  const [connectInstance] = useState(() => getStripeConnectInstance(fetchConnectClientSecret))
  const [loadError, setLoadError] = useState(null)

  useEffect(() => useAuthStore.subscribe((state, previousState) => {
    if (previousState.user && !state.user) resetStripeConnectInstance()
  }), [])

  function handleLoadError({ error }) {
    setLoadError(error?.message ?? 'Stripe payout tools could not be loaded.')
  }

  function handleOnboardingExit() {
    queryClient.invalidateQueries({ queryKey: ['connect-status'] })
  }

  function launchHostedOnboarding() {
    openHostedOnboarding(undefined, {
      onSuccess: ({ url }) => { window.location.href = url },
    })
  }

  function launchExpressDashboard() {
    openExpressDashboard(undefined, {
      onSuccess: ({ url }) => { window.location.href = url },
    })
  }

  if (isLoading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading payout settings...</Typography>
      </Stack>
    )
  }

  if (!connectInstance) {
    return (
      <Alert severity="warning">
        Stripe is not configured. Add VITE_STRIPE_PUBLISHABLE_KEY and restart the frontend.
      </Alert>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h6">Rent payouts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Stripe securely verifies your identity and bank account while you remain inside LotLord.
        </Typography>
      </Box>

      {loadError && (
        <Alert severity="error">
          {loadError} Use the Stripe fallback below if the embedded tools remain unavailable.
        </Alert>
      )}

      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectNotificationBanner onLoadError={handleLoadError} />

        {!status?.onboarded ? (
          <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
            <ConnectAccountOnboarding
              onExit={handleOnboardingExit}
              onLoadError={handleLoadError}
            />
          </Paper>
        ) : (
          <Stack spacing={2.5}>
            <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ px: 1, pt: 1, mb: 1 }}>
                Balance and payouts
              </Typography>
              <ConnectBalances onLoadError={handleLoadError} />
              <Divider sx={{ my: 2 }} />
              <ConnectPayouts onLoadError={handleLoadError} />
            </Paper>

            <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ px: 1, pt: 1, mb: 1 }}>
                Payout account
              </Typography>
              <ConnectAccountManagement onLoadError={handleLoadError} />
            </Paper>
          </Stack>
        )}
      </ConnectComponentsProvider>

      <Divider />
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Having trouble with the embedded payout tools?
        </Typography>
        <Button
          variant="text"
          size="small"
          startIcon={<AccountBalanceIcon />}
          endIcon={<OpenInNewIcon />}
          disabled={openingOnboarding || openingDashboard}
          onClick={status?.onboarded ? launchExpressDashboard : launchHostedOnboarding}
        >
          {status?.onboarded ? 'Open Stripe payout dashboard' : 'Continue setup on Stripe'}
        </Button>
      </Box>
    </Stack>
  )
}