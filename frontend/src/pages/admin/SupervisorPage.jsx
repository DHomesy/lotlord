import { useState } from 'react'
import {
  Box, Paper, Stack, Typography, List, ListItemButton, ListItemText,
  ListItemAvatar, Avatar, Badge, Divider, TextField, Button, Alert,
  Chip, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  IconButton, Tooltip, Snackbar, useTheme, useMediaQuery,
} from '@mui/material'
import AutoAwesomeIcon    from '@mui/icons-material/AutoAwesome'
import ReportProblemIcon  from '@mui/icons-material/ReportProblem'
import DoneAllIcon        from '@mui/icons-material/DoneAll'
import SendIcon           from '@mui/icons-material/Send'
import ArrowBackIcon      from '@mui/icons-material/ArrowBack'
import EmailIcon          from '@mui/icons-material/Email'
import SmsIcon            from '@mui/icons-material/Sms'
import AutorenewIcon      from '@mui/icons-material/Autorenew'

import PageContainer  from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import {
  useSupervisorConversations,
  useSupervisorOverride,
  useSupervisorUpdate,
} from '../../hooks/useSupervisor'
import { useInboxConversation, useInboxConversationTrace } from '../../hooks/useInbox'

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
const AUTOMATION_MODE_META = {
  ai_active: { label: 'AI Active', color: 'success' },
  ai_assist_only: { label: 'AI Assist Only', color: 'warning' },
  human_only: { label: 'Human Only', color: 'default' },
}

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

function AutomationModeChip({ mode }) {
  const meta = AUTOMATION_MODE_META[mode] || AUTOMATION_MODE_META.ai_active
  return (
    <Chip
      label={meta.label}
      size="small"
      color={meta.color}
      variant={mode === 'human_only' ? 'outlined' : 'filled'}
      sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
    />
  )
}

function TraceCheckChip({ ok, label }) {
  return (
    <Chip
      size="small"
      label={label}
      color={ok ? 'success' : 'default'}
      variant={ok ? 'filled' : 'outlined'}
      sx={{ height: 18, fontSize: 10 }}
    />
  )
}

function MaintenanceSlotStatusPanel({ conv }) {
  if (conv.category !== 'maintenance') return null

  const required = [
    { key: 'maintenance_issue', label: 'Issue', value: conv.maintenance_issue },
    { key: 'maintenance_onset_time', label: 'When started', value: conv.maintenance_onset_time },
    { key: 'maintenance_location', label: 'Location', value: conv.maintenance_location },
  ]
  const missing = Array.isArray(conv.maintenance_missing_fields) ? conv.maintenance_missing_fields : []

  return (
    <Paper variant="outlined" sx={{ px: 1.25, py: 1, mb: 1.25, bgcolor: 'warning.50', borderColor: 'warning.light' }}>
      <Stack spacing={0.75}>
        <Typography variant="caption" fontWeight={700} color="warning.dark">
          Maintenance triage status
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {required.map((slot) => {
            const filled = !!String(slot.value || '').trim()
            return (
              <Chip
                key={slot.key}
                size="small"
                label={filled ? `${slot.label}: captured` : `${slot.label}: missing`}
                color={filled ? 'success' : 'default'}
                variant={filled ? 'filled' : 'outlined'}
                sx={{ height: 18, fontSize: 10 }}
              />
            )
          })}
        </Stack>
        {missing.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Waiting on: {missing.join(', ')}
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}

function canCreateMaintenanceRequest(conv) {
  if (!conv || conv.category !== 'maintenance') return false
  if (conv.status === 'resolved') return false
  if (String(conv.review_reason || '').startsWith('maintenance_request_created:')) return false
  const missing = Array.isArray(conv.maintenance_missing_fields) ? conv.maintenance_missing_fields : []
  return missing.length === 0
}

function InboundTracePanel({ conversationId }) {
  const { data: trace, isLoading, isError } = useInboxConversationTrace(conversationId)

  if (isLoading) return null
  if (isError || !trace) {
    return <Alert severity="warning" sx={{ mx: 2, mt: 1 }}>Inbound trace is temporarily unavailable.</Alert>
  }

  return (
    <Paper variant="outlined" sx={{ mx: 2, mt: 1, p: 1.25, bgcolor: 'grey.50' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="caption" fontWeight={700}>Inbound Trace</Typography>
          <Typography variant="caption" color="text.secondary">
            {trace.latestInboundAt ? `Last inbound ${fmtDate(trace.latestInboundAt)}` : 'No inbound recorded yet'}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          <TraceCheckChip ok={trace.checkpoints?.receivedWebhook} label="Webhook" />
          <TraceCheckChip ok={trace.checkpoints?.matchedUser} label="Matched" />
          <TraceCheckChip ok={trace.checkpoints?.routedToConversation} label="Routed" />
          <TraceCheckChip ok={!trace.checkpoints?.queuedUnmatched} label="No unmatched" />
          <TraceCheckChip ok={!trace.checkpoints?.aiDraftPending} label="Draft cleared" />
          <TraceCheckChip ok={trace.checkpoints?.aiSent} label="AI sent" />
        </Stack>
      </Stack>
    </Paper>
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
                  <AutomationModeChip mode={c.automation_mode || 'ai_active'} />
                  {c.needs_human_review && (
                    <Chip
                      label="Review needed"
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ height: 16, fontSize: 10 }}
                    />
                  )}
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
                  {Number(c.unread_count) > 0 && (
                    <Chip
                      label="New reply"
                      size="small"
                      color="error"
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
  const [actionToast, setActionToast] = useState({ open: false, message: '', severity: 'success' })
  const { data, isLoading, isError, refetch } = useInboxConversation(conversationId)
  const { mutate: override, isPending: overriding, error: overrideError, reset: resetOverride } = useSupervisorOverride()
  const { mutate: update } = useSupervisorUpdate()

  if (isLoading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
  if (isError)   return <Alert severity="error" sx={{ m: 2 }}>Failed to load conversation.</Alert>

  const { conversation: conv, messages } = data
  const orderedMessages = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const isResolved  = conv.status === 'resolved'
  const isEscalated = conv.status === 'escalated'
  const canReopen = isResolved || isEscalated
  const currentMode = conv.automation_mode || 'ai_active'
  const canCreateTicket = canCreateMaintenanceRequest(conv)

  const showToast = (message, severity = 'success') => {
    setActionToast({ open: true, message, severity })
  }

  const handleOverride = () => {
    if (!overrideText.trim()) return
    resetOverride()
    override({ id: conv.id, content: overrideText }, {
      onSuccess: () => { setOverrideText(''); refetch() },
    })
  }

  const handleUpdate = (action, extra = {}) => {
    update({ id: conv.id, action, ...extra }, {
      onSuccess: (result) => {
        refetch()
        if (action === 'reopen') showToast('Conversation reopened. AI workflow restored.')
        if (action === 'escalate') showToast('Conversation escalated. Human review has been flagged.')
        if (action === 'set_mode') {
          const modeLabel = AUTOMATION_MODE_META[extra.mode]?.label || extra.mode
          showToast(`Automation mode set to ${modeLabel}.`)
        }
        if (action === 'create_maintenance_request') {
          const requestId = result?.maintenanceRequest?.id
          showToast(requestId ? `Maintenance request created (${requestId}).` : 'Maintenance request created.')
        }
      },
      onError: (err) => {
        const msg = err?.response?.data?.error || 'Unable to complete action.'
        showToast(msg, 'error')
      },
    })
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
          <Stack direction="row" spacing={0.5} mt={0.5} flexWrap="wrap">
            <AutomationModeChip mode={currentMode} />
            {conv.needs_human_review && (
              <Chip
                label="Human review needed"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <UrgencyChip urgency={conv.urgency} />
          {isEscalated && <Chip label="Escalated" size="small" color="warning" />}
          {isResolved  && <Chip label="Resolved"  size="small" color="success" />}
          {!canReopen && (
            <>
              <Tooltip title="Escalate — flag for manual review">
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
          {canReopen && (
            <Tooltip title="Re-open conversation and restore AI workflow">
              <IconButton size="small" color="primary" onClick={() => handleUpdate('reopen')}>
                <AutorenewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Set mode: AI Active">
            <Chip
              label="AI"
              size="small"
              color={currentMode === 'ai_active' ? 'success' : 'default'}
              variant={currentMode === 'ai_active' ? 'filled' : 'outlined'}
              onClick={() => handleUpdate('set_mode', { mode: 'ai_active' })}
              sx={{ height: 22, fontSize: 10, cursor: 'pointer' }}
            />
          </Tooltip>
          <Tooltip title="Set mode: AI Assist Only">
            <Chip
              label="Assist"
              size="small"
              color={currentMode === 'ai_assist_only' ? 'warning' : 'default'}
              variant={currentMode === 'ai_assist_only' ? 'filled' : 'outlined'}
              onClick={() => handleUpdate('set_mode', { mode: 'ai_assist_only' })}
              sx={{ height: 22, fontSize: 10, cursor: 'pointer' }}
            />
          </Tooltip>
          <Tooltip title="Set mode: Human Only">
            <Chip
              label="Human"
              size="small"
              color={currentMode === 'human_only' ? 'warning' : 'default'}
              variant={currentMode === 'human_only' ? 'filled' : 'outlined'}
              onClick={() => handleUpdate('set_mode', { mode: 'human_only' })}
              sx={{ height: 22, fontSize: 10, cursor: 'pointer' }}
            />
          </Tooltip>
          <Tooltip title={canCreateTicket ? 'Create maintenance request from captured triage fields' : 'Fill all maintenance triage fields before creating request'}>
            <span>
              <Chip
                label="Create ticket"
                size="small"
                color={canCreateTicket ? 'success' : 'default'}
                variant={canCreateTicket ? 'filled' : 'outlined'}
                onClick={canCreateTicket ? () => handleUpdate('create_maintenance_request') : undefined}
                sx={{ height: 22, fontSize: 10, cursor: canCreateTicket ? 'pointer' : 'not-allowed' }}
              />
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* Message list */}
      <InboundTracePanel conversationId={conv.id} />

      {/* Message list */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
            No messages yet.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {orderedMessages.map((msg) => {
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
          {isEscalated && (
            <Alert severity="warning" icon={<ReportProblemIcon />} sx={{ mb: 1 }}>
              This conversation is escalated. AI behavior is controlled by mode: {AUTOMATION_MODE_META[currentMode]?.label || currentMode}.
            </Alert>
          )}
          {currentMode === 'human_only' && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Human Only mode is active. AI draft generation is paused for this thread.
            </Alert>
          )}
          <MaintenanceSlotStatusPanel conv={conv} />
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

      <Snackbar
        open={actionToast.open}
        autoHideDuration={2500}
        onClose={() => setActionToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setActionToast((prev) => ({ ...prev, open: false }))}
          severity={actionToast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {actionToast.message}
        </Alert>
      </Snackbar>
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
