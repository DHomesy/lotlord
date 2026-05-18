import { useState } from 'react'
import {
  Box, Paper, Stack, Typography, List, ListItemButton, ListItemText,
  ListItemAvatar, Avatar, Badge, Divider, TextField, Button, Alert,
  Chip, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  IconButton, Tooltip, useTheme, useMediaQuery,
} from '@mui/material'
import AutoAwesomeIcon    from '@mui/icons-material/AutoAwesome'
import ReportProblemIcon  from '@mui/icons-material/ReportProblem'
import DoneAllIcon        from '@mui/icons-material/DoneAll'
import SendIcon           from '@mui/icons-material/Send'
import ArrowBackIcon      from '@mui/icons-material/ArrowBack'
import EmailIcon          from '@mui/icons-material/Email'
import SmsIcon            from '@mui/icons-material/Sms'

import PageContainer  from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import {
  useSupervisorConversations,
  useSupervisorOverride,
  useSupervisorUpdate,
} from '../../hooks/useSupervisor'
import { useInboxConversation } from '../../hooks/useInbox'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dtFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
})
const fmtDate = (v) => (v ? dtFmt.format(new Date(v)) : '')

function channelIcon(ch) {
  return ch === 'sms' ? <SmsIcon sx={{ fontSize: 14 }} /> : <EmailIcon sx={{ fontSize: 14 }} />
}

const URGENCY_COLOR = ['', 'success', 'success', 'warning', 'error', 'error']
const URGENCY_LABEL = ['', 'Low', 'Minor', 'Normal', 'High', 'Critical']

function UrgencyChip({ urgency }) {
  if (!urgency) return null
  return (
    <Chip
      label={URGENCY_LABEL[urgency] ?? urgency}
      size="small"
      color={URGENCY_COLOR[urgency] ?? 'default'}
      sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
    />
  )
}

// ─── Conversation list (left pane) ────────────────────────────────────────────
function SupervisorConvList({ conversations, selectedId, onSelect }) {
  if (!conversations?.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No conversations match the current filters.
        </Typography>
      </Box>
    )
  }

  return (
    <List disablePadding>
      {conversations.map((c, idx) => (
        <Box key={c.id}>
          <ListItemButton
            selected={c.id === selectedId}
            onClick={() => onSelect(c.id)}
            sx={{ px: 2, py: 1.5 }}
          >
            <ListItemAvatar>
              <Badge
                badgeContent={c.unread_count > 0 ? c.unread_count : null}
                color="error"
                overlap="circular"
              >
                <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>
                  {`${c.tenant_first_name?.[0] ?? ''}${c.tenant_last_name?.[0] ?? ''}`.toUpperCase()}
                </Avatar>
              </Badge>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {c.tenant_first_name} {c.tenant_last_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {c.landlord_first_name} {c.landlord_last_name}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" flexShrink={0}>
                    {fmtDate(c.last_message_at)}
                  </Typography>
                </Stack>
              }
              secondary={
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  {channelIcon(c.channel)}
                  <UrgencyChip urgency={c.urgency} />
                  {c.status !== 'open' && (
                    <Chip
                      label={c.status}
                      size="small"
                      color={c.status === 'escalated' ? 'warning' : 'success'}
                      sx={{ height: 16, fontSize: 10, textTransform: 'capitalize' }}
                    />
                  )}
                  {c.has_pending_suggestion && (
                    <Chip
                      icon={<AutoAwesomeIcon sx={{ fontSize: 11 }} />}
                      label="AI draft"
                      size="small"
                      color="warning"
                      sx={{ height: 16, fontSize: 10 }}
                    />
                  )}
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

// ─── Thread + override panel (right pane) ─────────────────────────────────────
function SupervisorThread({ conversationId, onBack }) {
  const [overrideText, setOverrideText] = useState('')
  const { data, isLoading, isError, refetch } = useInboxConversation(conversationId)
  const { mutate: override, isPending: overriding, error: overrideError, reset: resetOverride } = useSupervisorOverride()
  const { mutate: update } = useSupervisorUpdate()

  if (isLoading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
  if (isError)   return <Alert severity="error" sx={{ m: 2 }}>Failed to load conversation.</Alert>

  const { conversation: conv, messages } = data
  const isResolved  = conv.status === 'resolved'
  const isEscalated = conv.status === 'escalated'

  const handleOverride = () => {
    if (!overrideText.trim()) return
    resetOverride()
    override({ id: conv.id, content: overrideText }, {
      onSuccess: () => { setOverrideText(''); refetch() },
    })
  }

  const handleUpdate = (action) => {
    update({ id: conv.id, action }, { onSuccess: () => refetch() })
  }

  return (
    <Stack sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        {onBack && (
          <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>
          {`${conv.tenant_first_name?.[0] ?? ''}${conv.tenant_last_name?.[0] ?? ''}`.toUpperCase()}
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {conv.tenant_first_name} {conv.tenant_last_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            Landlord: {conv.landlord_first_name} {conv.landlord_last_name}
            {' · '}Channel: {conv.channel}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <UrgencyChip urgency={conv.urgency} />
          {isEscalated && <Chip label="Escalated" size="small" color="warning" />}
          {isResolved  && <Chip label="Resolved"  size="small" color="success" />}
          {!isResolved && !isEscalated && (
            <>
              <Tooltip title="Escalate — disable AI, flag for manual review">
                <IconButton size="small" color="warning" onClick={() => handleUpdate('escalate')}>
                  <ReportProblemIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Mark resolved">
                <IconButton size="small" color="success" onClick={() => handleUpdate('resolve')}>
                  <DoneAllIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </Box>

      {/* Message list */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
            No messages yet.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {messages.map((msg) => {
            const isInbound = msg.role === 'user'
            const isAiDraft = msg.suggested && !msg.sent_at
            return (
              <Box key={msg.id} sx={{ display: 'flex', justifyContent: isInbound ? 'flex-start' : 'flex-end' }}>
                <Paper
                  variant="outlined"
                  sx={{
                    maxWidth: '72%',
                    p: 1.5,
                    bgcolor: isAiDraft ? 'warning.50' : isInbound ? 'grey.50' : 'primary.50',
                    borderColor: isAiDraft ? 'warning.main' : isInbound ? 'divider' : 'primary.200',
                    opacity: isAiDraft ? 0.85 : 1,
                  }}
                >
                  {isAiDraft && (
                    <Stack direction="row" spacing={0.5} alignItems="center" mb={0.5}>
                      <AutoAwesomeIcon sx={{ fontSize: 13, color: 'warning.dark' }} />
                      <Typography variant="caption" color="warning.dark" fontWeight={600}>AI draft (pending)</Typography>
                    </Stack>
                  )}
                  {msg.supervisor_override && (
                    <Typography variant="caption" color="secondary" fontWeight={600} display="block" mb={0.25}>
                      ⚡ Supervisor override
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" mt={0.5}>
                    {channelIcon(conv.channel)}
                    <Typography variant="caption" color="text.secondary">{fmtDate(msg.created_at)}</Typography>
                  </Stack>
                </Paper>
              </Box>
            )
          })}
        </Stack>
      </Box>

      {/* Override panel */}
      {!isResolved && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
            Override (inject as landlord)
          </Typography>
          {overrideError && (
            <Alert severity="error" sx={{ mb: 1, py: 0.5 }}>
              {overrideError?.response?.data?.error || 'Failed to send override.'}
            </Alert>
          )}
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Type a message to inject…"
              value={overrideText}
              onChange={(e) => setOverrideText(e.target.value)}
              disabled={overriding}
            />
            <Button
              variant="contained"
              disabled={overriding || !overrideText.trim()}
              onClick={handleOverride}
              sx={{ mt: 0.5, minWidth: 48, px: 1.5 }}
            >
              {overriding ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
            </Button>
          </Stack>
        </Box>
      )}
    </Stack>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SupervisorPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [selectedId,    setSelectedId]    = useState(null)
  const [statusFilter,  setStatusFilter]  = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')

  const params = {
    ...(statusFilter  && { status: statusFilter }),
    ...(urgencyFilter && { urgency: urgencyFilter }),
  }

  const { data: conversations = [], isLoading } = useSupervisorConversations(params)

  const showList   = !isMobile || !selectedId
  const showThread = !isMobile || !!selectedId

  if (isLoading) return <LoadingOverlay />

  return (
    <PageContainer title="AI Supervisor">
      {/* Filters */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setSelectedId(null) }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="escalated">Escalated</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Urgency</InputLabel>
          <Select
            label="Urgency"
            value={urgencyFilter}
            onChange={(e) => { setUrgencyFilter(e.target.value); setSelectedId(null) }}
          >
            <MenuItem value="">All</MenuItem>
            {[1, 2, 3, 4, 5].map((u) => (
              <MenuItem key={u} value={u}>{URGENCY_LABEL[u]}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </Typography>
      </Stack>

      <Paper
        variant="outlined"
        sx={{ display: 'flex', height: 'calc(100vh - 260px)', minHeight: 400, overflow: 'hidden' }}
      >
        {/* Left — conversation list */}
        {showList && (
          <Box
            sx={{
              width: { xs: '100%', md: 340 },
              flexShrink: 0,
              borderRight: { md: 1 },
              borderColor: 'divider',
              overflowY: 'auto',
            }}
          >
            <SupervisorConvList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Box>
        )}

        {/* Right — thread + override */}
        {showThread && (
          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {selectedId ? (
              <SupervisorThread
                conversationId={selectedId}
                onBack={isMobile ? () => setSelectedId(null) : undefined}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Stack alignItems="center" spacing={1}>
                  <AutoAwesomeIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                  <Typography variant="body2" color="text.secondary">
                    Select a conversation to review
                  </Typography>
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </PageContainer>
  )
}
