import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, IconButton, Stack,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SendIcon from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import GroupsIcon from '@mui/icons-material/Groups'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import {
  useInvitations,
  useCreateEmployeeInvitation,
  useResendInvitation,
  useDeleteInvitation,
} from '../../hooks/useInvitations'
import { useMySubscription } from '../../hooks/useBilling'
import { hasStarter } from '../../lib/plans'
import { useAuthStore } from '../../store/authStore'

// ── Invite form schema ────────────────────────────────────────────────────────

const inviteSchema = z.object({
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
  email:     z.string().email('Valid email required'),
})

function InviteForm({ onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(inviteSchema),
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info" icon={false}>
        The employee will receive an email to create their account. They will have access to
        your properties, tenants, and operational tools — but cannot manage billing or subscriptions.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="First Name (optional)" fullWidth {...register('firstName')} />
        <TextField label="Last Name (optional)"  fullWidth {...register('lastName')} />
      </Stack>
      <TextField
        label="Email"
        type="email"
        fullWidth
        required
        {...register('email')}
        error={!!errors.email}
        helperText={errors.email?.message}
        InputProps={{
          startAdornment: <MailOutlineIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Sending…' : 'Send Invitation'}
      </Button>
    </Stack>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [inviteOpen, setInviteOpen]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [deletingId, setDeletingId]   = useState(null)
  const [sentTo, setSentTo]           = useState(null)

  const { data: invitesData, isLoading } = useInvitations()
  const { data: subscription }           = useMySubscription()
  const { mutate: invite, isPending: inviting, error: inviteError, reset: resetInvite } = useCreateEmployeeInvitation()
  const { mutate: resend }    = useResendInvitation()
  const { mutate: deleteInv } = useDeleteInvitation()
  const user = useAuthStore((s) => s.user)

  const isPaid      = hasStarter(subscription) || user?.role === 'admin'
  const allInvites  = Array.isArray(invitesData) ? invitesData : []
  const empInvites  = allInvites.filter((r) => r.type === 'employee')

  const now            = new Date()
  const activeMembers  = empInvites.filter((r) => !!r.accepted_at)
  const pendingInvites = empInvites.filter((r) => !r.accepted_at && new Date(r.expires_at) > now)
  const expiredInvites = empInvites.filter((r) => !r.accepted_at && new Date(r.expires_at) <= now)

  const handleInvite = (values) => {
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v))
    invite(payload, {
      onSuccess: (inv) => {
        setInviteOpen(false)
        resetInvite()
        setSentTo(inv.email)
      },
    })
  }

  const handleResend = (row) => {
    setResendingId(row.id)
    resend(row.id, { onSettled: () => setResendingId(null) })
  }

  const handleDeleteConfirm = () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    deleteInv(confirmDelete.id, {
      onSuccess: () => { setConfirmDelete(null); setDeletingId(null) },
      onError:   () => setDeletingId(null),
    })
  }

  // ── Column definitions ──────────────────────────────────────────────────────

  const activeCols = [
    {
      field: 'first_name', headerName: 'Name', flex: 1,
      valueGetter: (v, row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
    },
    { field: 'email',       headerName: 'Email',  flex: 1.5 },
    { field: 'accepted_at', headerName: 'Joined', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
    {
      field: '_status', headerName: 'Status', width: 110, sortable: false,
      valueGetter: () => '',
      renderCell: () => <Chip label="Active" size="small" color="success" />,
    },
  ]

  const inviteCols = [
    {
      field: 'first_name', headerName: 'Name', flex: 1,
      valueGetter: (v, row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
    },
    { field: 'email',      headerName: 'Email',   flex: 1.5 },
    { field: 'created_at', headerName: 'Invited', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
    { field: 'expires_at', headerName: 'Expires', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
    {
      field: '_actions', headerName: '', width: 90, sortable: false, filterable: false,
      valueGetter: () => '',
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Resend invitation">
            <span>
              <IconButton size="small" disabled={resendingId === row.id} onClick={(e) => { e.stopPropagation(); handleResend(row) }}>
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Revoke invitation">
            <span>
              <IconButton size="small" color="error" disabled={deletingId === row.id} onClick={(e) => { e.stopPropagation(); setConfirmDelete(row) }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer
      title="Team"
      actions={isPaid
        ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setInviteOpen(true)}>Invite Employee</Button>
        : null
      }
    >
      {/* Paygate */}
      {!isPaid && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button size="small" variant="contained" onClick={() => navigate('/profile?upgrade=1')}>
              Upgrade
            </Button>
          }
        >
          Adding team members requires the <strong>Starter plan ($15/mo)</strong>. Upgrade to invite up to 5 employees.
        </Alert>
      )}

      {/* Invite success banner */}
      {sentTo && (
        <Alert severity="success" onClose={() => setSentTo(null)} sx={{ mb: 2 }}>
          Invitation sent to <strong>{sentTo}</strong>. They'll receive a link to set up their account.
        </Alert>
      )}

      {/* Active Members ────────────────────────────────────────────────────── */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Active Members
      </Typography>

      {activeMembers.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <GroupsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No active team members yet.
          </Typography>
        </Box>
      ) : (
        <DataTable rows={activeMembers} columns={activeCols} loading={isLoading} />
      )}

      {/* Invitations ─────────────────────────────────────────────────────── */}
      {(pendingInvites.length > 0 || expiredInvites.length > 0) && (
        <>
          <Divider sx={{ my: 3 }} />

          {pendingInvites.length > 0 && (
            <>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                Pending Invitations
                <Chip label={pendingInvites.length} size="small" color="warning" sx={{ ml: 1, height: 20, fontSize: 11 }} />
              </Typography>
              <DataTable rows={pendingInvites} columns={inviteCols} loading={isLoading} />
            </>
          )}

          {expiredInvites.length > 0 && (
            <>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2, mb: 1, color: 'text.secondary' }}>
                Expired
              </Typography>
              <DataTable rows={expiredInvites} columns={inviteCols} loading={isLoading} />
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!isLoading && isPaid && activeMembers.length === 0 && pendingInvites.length === 0 && expiredInvites.length === 0 && (
        <EmptyState
          message="No team members yet. Invite an employee to get started."
          onAdd={() => setInviteOpen(true)}
          addLabel="Invite Employee"
        />
      )}

      {/* Revoke confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Revoke invitation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Revoke the invitation for{' '}
            <strong>
              {[confirmDelete?.first_name, confirmDelete?.last_name].filter(Boolean).join(' ') || confirmDelete?.email || 'this recipient'}
            </strong>? The invite link will stop working immediately.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={!!deletingId}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={!!deletingId}>
            {deletingId ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invite dialog ────────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onClose={() => { setInviteOpen(false); resetInvite() }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Invite an Employee</DialogTitle>
        <DialogContent>
          {inviteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {inviteError?.response?.data?.error ?? 'Failed to send invitation. Please try again.'}
            </Alert>
          )}
          <InviteForm onSubmit={handleInvite} loading={inviting} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
