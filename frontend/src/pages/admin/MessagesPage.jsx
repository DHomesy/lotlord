import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box, Paper, Stack, Typography, List, ListItemButton, ListItemText,
  ListItemAvatar, Avatar, Badge, Divider, TextField, Button, Alert,
  Chip, CircularProgress, IconButton, useTheme, useMediaQuery,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import AddIcon        from '@mui/icons-material/Add'
import ArrowBackIcon  from '@mui/icons-material/ArrowBack'
import SendIcon       from '@mui/icons-material/Send'
import EmailIcon      from '@mui/icons-material/Email'
import SmsIcon        from '@mui/icons-material/Sms'
import PageContainer  from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import TenantPicker   from '../../components/pickers/TenantPicker'
import {
  useConversations,
  useConversation,
  useSendMessage,
} from '../../hooks/useNotifications'

// ─── Schemas ─────────────────────────────────────────────────────────────────
const schema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body:    z.string().min(1, 'Message body is required'),
})

const newConvSchema = z.object({
  tenantId: z.string({ invalid_type_error: 'Please select a tenant' }).min(1, 'Please select a tenant'),
  subject:  z.string().min(1, 'Subject is required'),
  body:     z.string().min(1, 'Message body is required'),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────
const dtFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
})
const fmtDate = (v) => v ? dtFmt.format(new Date(v)) : ''

function initials(row) {
  return `${row.first_name?.[0] ?? ''}${row.last_name?.[0] ?? ''}`.toUpperCase()
}

function channelIcon(channel) {
  return channel === 'sms'
    ? <SmsIcon sx={{ fontSize: 14 }} />
    : <EmailIcon sx={{ fontSize: 14 }} />
}

// ─── Opt-in indicator ────────────────────────────────────────────────────────
function OptInChips({ emailOptIn, smsOptIn }) {
  return (
    <Stack direction="row" spacing={0.5}>
      <Chip
        icon={<EmailIcon sx={{ fontSize: 12 }} />}
        label="Email"
        size="small"
        color={emailOptIn ? 'success' : 'default'}
        variant={emailOptIn ? 'filled' : 'outlined'}
        sx={{ height: 20, fontSize: 11 }}
      />
      <Chip
        icon={<SmsIcon sx={{ fontSize: 12 }} />}
        label="SMS"
        size="small"
        color={smsOptIn ? 'success' : 'default'}
        variant={smsOptIn ? 'filled' : 'outlined'}
        sx={{ height: 20, fontSize: 11 }}
      />
    </Stack>
  )
}

// ─── New conversation dialog ─────────────────────────────────────────────────
function NewConversationDialog({ open, onClose, onCreated }) {
  const { mutate: send, isPending, error, reset: resetMutation } = useSendMessage()
  const { control, register, handleSubmit, reset: resetForm, formState: { errors } } = useForm({
    resolver: zodResolver(newConvSchema),
    defaultValues: { tenantId: null, subject: '', body: '' },
  })

  const handleClose = () => {
    resetForm()
    resetMutation()
    onClose()
  }

  const onSubmit = ({ tenantId, subject, body }) => {
    send({ tenantId, subject, body }, {
      onSuccess: () => {
        handleClose()
        onCreated(tenantId)
      },
    })
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Message</DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="new-conv-form" onSubmit={handleSubmit(onSubmit)} spacing={2} mt={0.5}>
          {error && (
            <Alert severity="error">
              {error?.response?.data?.error || 'Failed to send message.'}
            </Alert>
          )}
          <Controller
            name="tenantId"
            control={control}
            render={({ field }) => (
              <TenantPicker
                label="Recipient tenant"
                value={field.value}
                onChange={field.onChange}
                error={!!errors.tenantId}
                helperText={errors.tenantId?.message}
              />
            )}
          />
          <TextField
            label="Subject"
            fullWidth
            {...register('subject')}
            error={!!errors.subject}
            helperText={errors.subject?.message}
          />
          <TextField
            label="Message"
            fullWidth
            multiline
            rows={4}
            {...register('body')}
            error={!!errors.body}
            helperText={errors.body?.message}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button form="new-conv-form" type="submit" variant="contained" disabled={isPending} startIcon={<SendIcon />}>
          {isPending ? 'Sending…' : 'Send'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Conversation list (left pane) ───────────────────────────────────────────
function ConversationList({ conversations, selectedTenantId, onSelect }) {
  if (!conversations?.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No conversations yet. Click <strong>New Message</strong> above to start one.
        </Typography>
      </Box>
    )
  }

  return (
    <List disablePadding>
      {conversations.map((c, idx) => (
        <Box key={c.tenant_id}>
          <ListItemButton
            selected={c.tenant_id === selectedTenantId}
            onClick={() => onSelect(c.tenant_id)}
            sx={{ px: 2, py: 1.5 }}
          >
            <ListItemAvatar>
              <Badge badgeContent={c.unread_count > 0 ? c.unread_count : null} color="error">
                <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>
                  {initials(c)}
                </Avatar>
              </Badge>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {c.first_name} {c.last_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmtDate(c.last_at)}
                  </Typography>
                </Stack>
              }
              secondary={
                <Stack spacing={0.25}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {channelIcon(c.last_channel)}
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {c.last_direction === 'inbound' ? '← ' : '→ '}
                      {c.last_subject || (c.last_body?.slice(0, 40) + '…')}
                    </Typography>
                  </Stack>
                  <OptInChips emailOptIn={c.email_opt_in} smsOptIn={c.sms_opt_in} />
                </Stack>
              }
              secondaryTypographyProps={{ component: 'div' }}
            />
          </ListItemButton>
          {idx < conversations.length - 1 && <Divider />}
        </Box>
      ))}
    </List>
  )
}

// ─── Thread view (right pane) ────────────────────────────────────────────────
function ThreadView({ tenantId, onBack }) {
  const theme   = useTheme()
  const { data, isLoading, isError } = useConversation(tenantId)
  const { mutate: send, isPending, error: sendError, reset } = useSendMessage()
  const { register, handleSubmit, reset: resetForm, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  if (isLoading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
  if (isError)   return <Alert severity="error" sx={{ m: 2 }}>Failed to load conversation.</Alert>

  const { tenant, messages } = data

  const onSubmit = (values) => {
    send({ tenantId, ...values }, {
      onSuccess: () => { resetForm(); reset() },
    })
  }

  const canSend = tenant.email_opt_in || tenant.sms_opt_in

  return (
    <Stack sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Thread header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        {onBack && (
          <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>{initials(tenant)}</Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            {tenant.first_name} {tenant.last_name}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <OptInChips emailOptIn={tenant.email_opt_in} smsOptIn={tenant.sms_opt_in} />
          </Stack>
        </Box>
      </Box>

      {/* Message list */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
            No messages yet. Compose below to start the conversation.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {messages.map((msg) => {
            const isInbound = msg.direction === 'inbound'
            return (
              <Box
                key={msg.id}
                sx={{
                  display: 'flex',
                  justifyContent: isInbound ? 'flex-start' : 'flex-end',
                }}
              >
                <Paper
                  variant="outlined"
                  sx={{
                    maxWidth: '72%',
                    p: 1.5,
                    bgcolor: isInbound
                      ? 'grey.50'
                      : theme.palette.primary.main + '14',
                    borderColor: isInbound
                      ? 'divider'
                      : theme.palette.primary.main + '44',
                  }}
                >
                  {msg.subject && (
                    <Typography variant="caption" fontWeight={600} display="block" mb={0.25}>
                      {msg.subject}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {msg.body}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" mt={0.5}>
                    {channelIcon(msg.channel)}
                    <Typography variant="caption" color="text.secondary">
                      {fmtDate(msg.created_at)}
                    </Typography>
                    {msg.status && msg.status !== 'received' && (
                      <Chip
                        label={msg.status}
                        size="small"
                        color={msg.status === 'sent' ? 'success' : msg.status === 'failed' ? 'error' : 'default'}
                        variant="outlined"
                        sx={{ height: 16, fontSize: 10 }}
                      />
                    )}
                  </Stack>
                </Paper>
              </Box>
            )
          })}
        </Stack>
      </Box>

      {/* Compose area */}
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{ borderTop: 1, borderColor: 'divider', px: 2, py: 1.5 }}
      >
        {!canSend && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            This tenant has not opted in to any notification channel. They must update their preferences before you can message them.
          </Alert>
        )}
        {sendError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {sendError?.response?.data?.error || 'Failed to send message.'}
          </Alert>
        )}
        <Stack spacing={1}>
          <TextField
            label="Subject"
            size="small"
            fullWidth
            disabled={!canSend || isPending}
            {...register('subject')}
            error={!!errors.subject}
            helperText={errors.subject?.message}
          />
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label="Message"
              size="small"
              fullWidth
              multiline
              rows={3}
              disabled={!canSend || isPending}
              {...register('body')}
              error={!!errors.body}
              helperText={errors.body?.message}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!canSend || isPending}
              sx={{ mt: 0.5, minWidth: 48, px: 1.5 }}
            >
              {isPending ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const theme    = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [composeOpen, setComposeOpen]           = useState(false)

  const { data: conversations = [], isLoading } = useConversations()

  if (isLoading) return <LoadingOverlay />

  const showList   = !isMobile || !selectedTenantId
  const showThread = !isMobile || !!selectedTenantId

  return (
    <PageContainer
      title="Messages"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setComposeOpen(true)}>
          New Message
        </Button>
      }
    >
      <Paper
        variant="outlined"
        sx={{
          display: 'flex',
          height: 'calc(100vh - 160px)',
          minHeight: 400,
          overflow: 'hidden',
        }}
      >
        {/* Left — conversation list */}
        {showList && (
          <Box
            sx={{
              width: { xs: '100%', md: 300 },
              flexShrink: 0,
              borderRight: { md: 1 },
              borderColor: 'divider',
              overflowY: 'auto',
            }}
          >
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={600}>Conversations</Typography>
            </Box>
            <ConversationList
              conversations={conversations}
              selectedTenantId={selectedTenantId}
              onSelect={setSelectedTenantId}
            />
          </Box>
        )}

        {/* Right — thread view */}
        {showThread && (
          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {selectedTenantId ? (
              <ThreadView
                tenantId={selectedTenantId}
                onBack={isMobile ? () => setSelectedTenantId(null) : undefined}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" color="text.secondary">
                  Select a conversation to view it
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      <NewConversationDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(tenantId) => setSelectedTenantId(tenantId)}
      />
    </PageContainer>
  )
}
