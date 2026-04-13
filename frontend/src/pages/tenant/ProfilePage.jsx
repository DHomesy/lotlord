import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, Alert, Typography, Card, CardContent, Divider, Box } from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PageContainer from '../../components/layout/PageContainer'
import ConnectBankDialog from '../../components/billing/ConnectBankDialog'
import { useAuthStore } from '../../store/authStore'
import { useUpdateMe, useChangePassword } from '../../hooks/useUsers'
import { useMyPaymentMethods } from '../../hooks/useStripeSetup'

const profileSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Min 8 characters'),
})

export default function TenantProfilePage() {
  const user = useAuthStore((s) => s.user)
  const { mutate: updateMe, isPending: savingProfile, isSuccess: profileSaved } = useUpdateMe()
  const { mutate: changePassword, isPending: changingPw, isSuccess: pwChanged, isError: pwError } = useChangePassword()
  const { data: paymentMethods = [] } = useMyPaymentMethods()
  const [bankOpen, setBankOpen] = useState(false)

  const profileForm = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user?.name || '', phone: user?.phone || '' } })
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema) })

  return (
    <PageContainer title="My Profile">
      <Typography variant="h6" sx={{ mb: 2 }}>Profile</Typography>
      {profileSaved && <Alert severity="success" sx={{ mb: 2 }}>Saved!</Alert>}
      <Stack component="form" onSubmit={profileForm.handleSubmit(updateMe)} spacing={2} sx={{ maxWidth: 400, mb: 5 }}>
        <TextField label="Name" {...profileForm.register('name')} error={!!profileForm.formState.errors.name} />
        <TextField label="Phone" {...profileForm.register('phone')} />
        <Button type="submit" variant="contained" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Profile'}</Button>
      </Stack>

      <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
      {pwChanged && <Alert severity="success" sx={{ mb: 2 }}>Password changed!</Alert>}
      {pwError && <Alert severity="error" sx={{ mb: 2 }}>Incorrect current password.</Alert>}
      <Stack component="form" onSubmit={passwordForm.handleSubmit(changePassword)} spacing={2} sx={{ maxWidth: 400 }}>
        <TextField label="Current Password" type="password" {...passwordForm.register('current_password')} />
        <TextField label="New Password" type="password" {...passwordForm.register('new_password')} error={!!passwordForm.formState.errors.new_password} helperText={passwordForm.formState.errors.new_password?.message} />
        <Button type="submit" variant="contained" disabled={changingPw}>{changingPw ? 'Saving…' : 'Change Password'}</Button>
      </Stack>

      {/* ── Billing ── */}
      <Divider sx={{ my: 4 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6">Billing</Typography>
          <Typography variant="body2" color="text.secondary">
            Bank accounts linked for ACH rent payments (0.8% fee, max $5). You can connect multiple accounts.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AccountBalanceIcon />}
          onClick={() => setBankOpen(true)}
          sx={{ ml: 2, flexShrink: 0 }}
        >
          {paymentMethods.length > 0 ? 'Add Account' : 'Connect Bank'}
        </Button>
      </Stack>

      {paymentMethods.length === 0 ? (
        <Alert severity="info" sx={{ maxWidth: 460, mt: 2 }}>No bank account linked yet.</Alert>
      ) : (
        <Stack spacing={1} sx={{ maxWidth: 460, mt: 2 }}>
          {paymentMethods.map((pm) => (
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

      <ConnectBankDialog open={bankOpen} onClose={() => setBankOpen(false)} />
    </PageContainer>
  )
}
