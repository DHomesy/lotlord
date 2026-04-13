import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, Typography } from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PageContainer from '../../components/layout/PageContainer'
import TenantPicker from '../../components/pickers/TenantPicker'
import ConnectBankDialog from '../../components/billing/ConnectBankDialog'
import { usePaymentMethods, useConnectStatus } from '../../hooks/useStripeSetup'
import { useMySubscription, useCreateCheckoutSession } from '../../hooks/useBilling'
import { useTenant } from '../../hooks/useTenants'

function TenantBankSection({ tenantId }) {
  const [bankOpen, setBankOpen] = useState(false)
  const { data: tenant } = useTenant(tenantId)
  const { data: methods = [], isLoading } = usePaymentMethods(tenantId)
  const tenantName = tenant
    ? `${tenant.first_name ?? tenant?.tenant?.first_name ?? ''} ${tenant.last_name ?? tenant?.tenant?.last_name ?? ''}`.trim()
    : ''

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {tenantName || 'Tenant'} — Bank Accounts
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AccountBalanceIcon />}
          onClick={() => setBankOpen(true)}
        >
          {methods.length > 0 ? 'Add Another' : 'Connect Bank'}
        </Button>
      </Stack>

      {isLoading ? (
        <CircularProgress size={20} sx={{ ml: 1 }} />
      ) : methods.length === 0 ? (
        <Alert severity="info">No bank account connected for this tenant.</Alert>
      ) : (
        <Stack spacing={1}>
          {methods.map((pm) => (
            <Card key={pm.id} variant="outlined">
              <CardContent sx={{ py: '8px !important', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <AccountBalanceIcon fontSize="small" color="action" />
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {pm.bankName} •••• {pm.last4}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{pm.accountType}</Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <ConnectBankDialog
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        tenantId={tenantId}
        tenantName={tenantName}
      />
    </>
  )
}

export default function BillingPage() {
  const navigate = useNavigate()
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const { data: subscription } = useMySubscription()
  const { data: connectStatus } = useConnectStatus()
  const checkout = useCreateCheckoutSession()

  const isPro = ['active', 'trialing'].includes(subscription?.status)
  const connectReady = connectStatus?.onboarded === true

  return (
    <PageContainer title="Billing">
      {!isPro && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
            >
              Upgrade to Pro
            </Button>
          }
        >
          ACH bank account collection requires a <strong>Pro subscription</strong>. Upgrade to
          enable Stripe ACH payments for your tenants.
        </Alert>
      )}

      {isPro && !connectReady && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/profile')}>
              Complete Setup
            </Button>
          }
        >
          Your <strong>Stripe payout account</strong> is not set up. Complete Stripe Connect
          onboarding in your Profile before collecting ACH payments.
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage Stripe ACH bank account connections for tenants. Select a tenant below to view their
        connected bank accounts or set up a new one. For a full payment history, see the{' '}
        <strong>Ledger</strong>.
      </Typography>

      <Box sx={{ maxWidth: 460 }}>
        <TenantPicker
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          label="Select Tenant"
          disabled={!isPro || !connectReady}
        />
      </Box>

      {selectedTenantId && <TenantBankSection tenantId={selectedTenantId} />}
    </PageContainer>
  )
}

