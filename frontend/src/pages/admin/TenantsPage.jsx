import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Stack, TextField, Alert, Tooltip, IconButton, Chip, Typography,
  Box, Divider, Tab, Tabs, ToggleButtonGroup, ToggleButton,
  useTheme, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import SmsIcon from '@mui/icons-material/Sms'
import SendIcon from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import PeopleIcon from '@mui/icons-material/People'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import EmptyState from '../../components/common/EmptyState'
import UnitPicker from '../../components/pickers/UnitPicker'
import { useTenants } from '../../hooks/useTenants'
import { useCreateInvitation, useCreateEmployeeInvitation, useInvitations, useResendInvitation, useDeleteInvitation } from '../../hooks/useInvitations'
import { useAuthStore } from '../../store/authStore'

// ── Column definitions ────────────────────────────────────────────────────────

const tenantColumns = [
  { field: 'first_name', headerName: 'First Name', flex: 1 },
  { field: 'last_name',  headerName: 'Last Name',  flex: 1 },
  { field: 'email',      headerName: 'Email',      flex: 1.5 },
  { field: 'phone',      headerName: 'Phone',      width: 140 },
]

function buildInviteColumns(view, onResend, onDelete, resendingId, deletingId) {
  const base = [
    {
      field: 'first_name', headerName: 'Name', flex: 1,
      valueGetter: (v, row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
    },
    { field: 'email', headerName: 'Email', flex: 1.2 },
    { field: 'phone', headerName: 'Phone', width: 120 },
    {
      field: 'property_name', headerName: 'Unit', flex: 1,
      valueGetter: (v, row) => row.property_name
        ? `${row.property_name}${row.unit_number ? ` — Unit ${row.unit_number}` : ''}`
        : '—',
    },
    { field: 'created_at', headerName: 'Sent', width: 100, valueFormatter: (v) => v?.slice(0, 10) },
  ]

  if (view === 'accepted') {
    return [
      ...base,
      { field: 'accepted_at', headerName: 'Accepted', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
    ]
  }

  if (view === 'expired') {
    return [
      ...base,
      { field: 'expires_at', headerName: 'Expired', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
      {
        field: '_actions', headerName: '', width: 90, sortable: false, filterable: false,
        valueGetter: () => '',
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Resend (refreshes link)">
              <span>
                <IconButton size="small" disabled={resendingId === row.id} onClick={(e) => { e.stopPropagation(); onResend(row) }}>
                  <SendIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete invitation">
              <span>
                <IconButton size="small" color="error" disabled={deletingId === row.id} onClick={(e) => { e.stopPropagation(); onDelete(row) }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ),
      },
    ]
  }

  // pending view
  return [
    ...base,
    { field: 'expires_at', headerName: 'Expires', width: 100, valueFormatter: (v) => v?.slice(0, 10) },
    {
      field: '_actions', headerName: '', width: 90, sortable: false, filterable: false,
      valueGetter: () => '',
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Resend invitation">
            <span>
              <IconButton size="small" disabled={resendingId === row.id} onClick={(e) => { e.stopPropagation(); onResend(row) }}>
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete invitation">
            <span>
              <IconButton size="small" color="error" disabled={deletingId === row.id} onClick={(e) => { e.stopPropagation(); onDelete(row) }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ]
}

// ── Invite form schema ────────────────────────────────────────────────────────

const inviteSchema = z.object({
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
  email:     z.string().email('Valid email required').optional().or(z.literal('')),
  phone:     z.string().optional(),
  unitId:    z.string().optional(),
}).refine((d) => d.email || d.phone, {
  message: 'At least one of email or phone is required',
  path: ['email'],
})

// ── Invite Form component ─────────────────────────────────────────────────────

function InviteForm({ onSubmit, loading }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(inviteSchema),
  })

  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info" icon={false}>
        The tenant will receive a link to create their own account.
        You will never see or set their password.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="First Name (optional)" fullWidth {...register('firstName')} />
        <TextField label="Last Name (optional)"  fullWidth {...register('lastName')} />
      </Stack>

      <TextField
        label="Email"
        type="email"
        fullWidth
        {...register('email')}
        error={!!errors.email}
        helperText={errors.email?.message}
        InputProps={{
          startAdornment: <MailOutlineIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      <TextField
        label="Phone (for SMS invite)"
        fullWidth
        {...register('phone')}
        error={!!errors.phone}
        helperText={errors.phone?.message}
        InputProps={{
          startAdornment: <SmsIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      <Controller
        name="unitId"
        control={control}
        render={({ field }) => (
          <UnitPicker
            value={field.value ?? null}
            onChange={field.onChange}
            label="Unit (optional — auto-attaches tenant)"
            helperText="Leave blank if you want to assign the unit later"
          />
        )}
      />

      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Sending…' : 'Send Invitation'}
      </Button>
    </Stack>
  )
}

// ── Employee invite form schema ───────────────────────────────────────────────

const employeeInviteSchema = z.object({
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
  email:     z.string().email('Valid email required'),
})

function EmployeeInviteForm({ onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(employeeInviteSchema),
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
        {loading ? 'Sending…' : 'Send Employee Invitation'}
      </Button>
    </Stack>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isEmployee = user?.role === 'employee'
  const [pageTab, setPageTab] = useState(0)           // 0=Tenants 1=Team Members
  const [open, setOpen]             = useState(false)
  const [empOpen, setEmpOpen]       = useState(false)
  const [inviteView, setInviteView] = useState('pending') // 'pending' | 'accepted' | 'expired'
  const [sentTo, setSentTo]         = useState(null)
  const [resendInfo, setResendInfo] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [deletingId, setDeletingId]   = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // invitation row to delete

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [copied, setCopied]         = useState(false)

  const { data: tenantsData, isLoading: loadingTenants } = useTenants()
  const { data: invitesData,  isLoading: loadingInvites } = useInvitations()
  const { mutate: invite,  isPending, error: inviteError, reset: resetInvite }  = useCreateInvitation()
  const { mutate: inviteEmployee, isPending: invitingEmp, error: empError, reset: resetEmp } = useCreateEmployeeInvitation()
  const { mutate: resend }              = useResendInvitation()
  const { mutate: deleteInv }           = useDeleteInvitation()

  const tenants = Array.isArray(tenantsData) ? tenantsData : (tenantsData?.tenants ?? tenantsData?.data ?? [])
  const allInvites = Array.isArray(invitesData) ? invitesData : []

  const now = new Date()
  const pendingInvites  = allInvites.filter((r) => !r.accepted_at && new Date(r.expires_at) > now)
  const acceptedInvites = allInvites.filter((r) => !!r.accepted_at)
  const expiredInvites  = allInvites.filter((r) => !r.accepted_at && new Date(r.expires_at) <= now)

  const inviteRows = inviteView === 'pending'
    ? pendingInvites
    : inviteView === 'accepted'
      ? acceptedInvites
      : expiredInvites

  const [empSentTo, setEmpSentTo] = useState(null)

  const handleInvite = (values) => {
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v))
    invite(payload, {
      onSuccess: (inv) => {
        setOpen(false)
        resetInvite()
        setSentTo({ email: inv.email, phone: inv.phone, signupUrl: inv.signupUrl, warning: inv.deliveryWarning })
      },
    })
  }

  const handleResend = (row) => {
    setResendingId(row.id)
    resend(row.id, {
      onSuccess: (inv) => {
        setResendInfo({ email: inv.email, phone: inv.phone, signupUrl: inv.signupUrl, warning: inv.deliveryWarning })
        setResendingId(null)
      },
      onError: () => setResendingId(null),
    })
  }

  const handleDeleteConfirm = () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    deleteInv(confirmDelete.id, {
      onSuccess: () => { setConfirmDelete(null); setDeletingId(null) },
      onError:   () => setDeletingId(null),
    })
  }

  const handleEmployeeInvite = (values) => {
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v))
    inviteEmployee(payload, {
      onSuccess: (inv) => {
        setEmpOpen(false)
        resetEmp()
        setEmpSentTo({ email: inv.email, signupUrl: inv.signupUrl })
      },
    })
  }

  const inviteColumns = buildInviteColumns(inviteView, handleResend, (row) => setConfirmDelete(row), resendingId, deletingId)

  const pageActions = pageTab === 0
    ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Invite Tenant</Button>
    : !isEmployee
      ? <Button variant="contained" startIcon={<PeopleIcon />} onClick={() => setEmpOpen(true)}>Invite Employee</Button>
      : null

  return (
    <PageContainer title="Tenants" actions={pageActions}>
      {/* Page-level tabs: Tenants / Team Members */}
      <Tabs value={pageTab} onChange={(_, v) => setPageTab(v)} sx={{ mb: 3 }}>
        <Tab label="Tenants" />
        {!isEmployee && <Tab label="Team Members" />}
      </Tabs>

      {/* ── Tenants tab ─────────────────────────────────────────────────── */}
      {pageTab === 0 && (<>
      {/* Resend confirmation banner */}
      {resendInfo && (
        <Alert
          severity={resendInfo.warning ? 'warning' : 'success'}
          onClose={() => setResendInfo(null)}
          sx={{ mb: 2 }}
        >
          {resendInfo.warning ? (
            <>
              Invitation re-saved, but <strong>delivery failed</strong>
              {resendInfo.warning.map((w) => ` (${w.channel}: ${w.message})`).join('; ')}.
              {resendInfo.signupUrl && (
                <> Share this link manually: <strong>{resendInfo.signupUrl}</strong>
                  <Tooltip title="Copy link">
                    <IconButton size="small" sx={{ ml: 0.5 }} onClick={() => { navigator.clipboard.writeText(resendInfo.signupUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {copied && <span style={{ marginLeft: 4, fontSize: 12 }}>Copied!</span>}
                </>
              )}
            </>
          ) : (
            <>
              Invitation resent
              {resendInfo.email && <> to <strong>{resendInfo.email}</strong></>}
              {resendInfo.email && resendInfo.phone && ' and'}
              {resendInfo.phone && <> via SMS to <strong>{resendInfo.phone}</strong></>}.
              {' '}A fresh 7-day link has been sent.
            </>
          )}
        </Alert>
      )}

      {/* Success / warning banner after sending invite */}
      {sentTo && (
        <Alert
          severity={sentTo.warning ? 'warning' : 'success'}
          onClose={() => setSentTo(null)}
          sx={{ mb: 2 }}
        >
          {sentTo.warning ? (
            <>
              Invitation saved, but <strong>delivery failed</strong>
              {sentTo.warning.map((w) => ` (${w.channel}: ${w.message})`).join('; ')}.
              {sentTo.signupUrl && (
                <> Share this link manually: <strong>{sentTo.signupUrl}</strong></>
              )}
            </>
          ) : (
            <>
              Invitation sent
              {sentTo.email && <> to <strong>{sentTo.email}</strong></>}
              {sentTo.email && sentTo.phone && ' and'}
              {sentTo.phone && <> via SMS to <strong>{sentTo.phone}</strong></>}.
              {' '}The tenant will appear here once they complete sign-up.
            </>
          )}
        </Alert>
      )}

      {/* Active tenants */}
      {!loadingTenants && tenants.length === 0 && acceptedInvites.length === 0 ? (
        <EmptyState
          message="No tenants yet. Invite your first tenant to get started."
          onAdd={() => setOpen(true)}
          addLabel="Invite Tenant"
        />
      ) : !loadingTenants && tenants.length === 0 && acceptedInvites.length > 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {acceptedInvites.length === 1
            ? 'Your tenant has accepted their invitation. Create a lease to activate their account.'
            : `${acceptedInvites.length} tenants have accepted their invitations. Create a lease for each to activate their accounts.`}
        </Alert>
      ) : (
        <DataTable
          rows={tenants}
          columns={tenantColumns}
          loading={loadingTenants}
          onRowClick={(p) => navigate(`/tenants/${p.id}`)}
          sx={{ cursor: 'pointer' }}
        />
      )}

      {/* Invitations section */}
      <Box sx={{ mt: 4 }}>
        <Divider sx={{ mb: 2 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Invitations
          </Typography>
          <ToggleButtonGroup
            value={inviteView}
            exclusive
            onChange={(_, v) => { if (v) setInviteView(v) }}
            size="small"
          >
            <ToggleButton value="pending">
              Pending
              {pendingInvites.length > 0 && (
                <Chip label={pendingInvites.length} size="small" color="warning" sx={{ ml: 1, height: 18, fontSize: 11 }} />
              )}
            </ToggleButton>
            <ToggleButton value="accepted">
              Accepted
              {acceptedInvites.length > 0 && (
                <Chip label={acceptedInvites.length} size="small" color="success" sx={{ ml: 1, height: 18, fontSize: 11 }} />
              )}
            </ToggleButton>
            <ToggleButton value="expired">
              Expired
              {expiredInvites.length > 0 && (
                <Chip label={expiredInvites.length} size="small" color="error" sx={{ ml: 1, height: 18, fontSize: 11 }} />
              )}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <DataTable rows={inviteRows} columns={inviteColumns} loading={loadingInvites} />
      </Box>
      </>)}

      {/* ── Team Members tab ─────────────────────────────────────────────── */}
      {pageTab === 1 && !isEmployee && (<>
        {empSentTo && (
          <Alert severity="success" onClose={() => setEmpSentTo(null)} sx={{ mb: 2 }}>
            Employee invitation sent to <strong>{empSentTo.email}</strong>.
            They will receive a sign-up link to create their account.
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Invite team members to help manage your properties. Employees can view and manage
          tenants, leases, charges, and maintenance — but cannot access billing or subscription settings.
        </Typography>
        <DataTable
          rows={allInvites.filter((r) => r.role === 'employee')}
          columns={[
            { field: 'first_name', headerName: 'Name', flex: 1,
              valueGetter: (v, row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || '—' },
            { field: 'email', headerName: 'Email', flex: 1.5 },
            { field: 'created_at', headerName: 'Invited', width: 110, valueFormatter: (v) => v?.slice(0, 10) },
            { field: 'accepted_at', headerName: 'Accepted', width: 110, valueFormatter: (v) => v ? v.slice(0, 10) : '—' },
            { field: 'expires_at', headerName: 'Expires', width: 110,
              renderCell: ({ row }) => row.accepted_at
                ? <Chip label="Accepted" size="small" color="success" />
                : new Date(row.expires_at) > new Date()
                  ? <Chip label={row.expires_at?.slice(0, 10)} size="small" color="warning" />
                  : <Chip label="Expired" size="small" color="error" />,
            },
          ]}
          loading={loadingInvites}
        />
      </>)}

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete invitation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete the invitation for <strong>{[confirmDelete?.first_name, confirmDelete?.last_name].filter(Boolean).join(' ') || confirmDelete?.email || 'this recipient'}</strong>?
            This cannot be undone. The invite link will stop working immediately.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={!!deletingId}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={!!deletingId}>
            {deletingId ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={open} onClose={() => { setOpen(false); resetInvite() }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Invite a Tenant</DialogTitle>
        <DialogContent>
          {inviteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {inviteError?.response?.data?.error ?? 'Failed to send invitation. Please try again.'}
            </Alert>
          )}
          <InviteForm onSubmit={handleInvite} loading={isPending} />
        </DialogContent>
      </Dialog>

      {/* Employee invite dialog */}
      <Dialog open={empOpen} onClose={() => { setEmpOpen(false); resetEmp() }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Invite an Employee</DialogTitle>
        <DialogContent>
          {empError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {empError?.response?.data?.error ?? 'Failed to send invitation. Please try again.'}
            </Alert>
          )}
          <EmployeeInviteForm onSubmit={handleEmployeeInvite} loading={invitingEmp} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
