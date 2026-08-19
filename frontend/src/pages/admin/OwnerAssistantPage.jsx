import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import PageContainer from '../../components/layout/PageContainer'
import OwnerQaSnapshotCard from '../../components/ai/OwnerQaSnapshotCard'
import {
  useCreateOwnerQaSession,
  useCreateOwnerQaSessionSnapshot,
  useDeleteOwnerQaSession,
  useOwnerQaSession,
  useOwnerQaSessions,
  useUpdateOwnerQaSession,
} from '../../hooks/useInbox'
import { useAuthStore } from '../../store/authStore'

const QUICK_PROMPTS = [
  'What dues are coming up in the next 30 days?',
  'Which tenants are currently past due?',
  'Show me an aging summary (1-30, 31-60, 61-90, 90+).',
  'Show me tenant balances with positive amounts only.',
  'Give me maintenance status including completed work.',
]

export default function OwnerAssistantPage() {
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'landlord'

  const [prompt, setPrompt] = useState('')
  const [search, setSearch] = useState('')
  const [sessionPage] = useState(1)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyItems, setHistoryItems] = useState([])
  const [editingTitle, setEditingTitle] = useState('')

  const {
    data: sessionsResult,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useOwnerQaSessions({ limit: 20, page: sessionPage, q: search })

  const sessions = useMemo(() => sessionsResult?.sessions || [], [sessionsResult])

  const {
    data: sessionDetail,
    isLoading: detailLoading,
    error: detailError,
  } = useOwnerQaSession(selectedSessionId, { limit: 10, page: historyPage })

  const {
    mutate: createSession,
    isPending: creatingSession,
  } = useCreateOwnerQaSession()

  const {
    mutate: renameSession,
    isPending: renamingSession,
  } = useUpdateOwnerQaSession()

  const {
    mutate: deleteSession,
    isPending: deletingSession,
  } = useDeleteOwnerQaSession()

  const {
    mutate: runSnapshot,
    isPending,
    error,
  } = useCreateOwnerQaSessionSnapshot()

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id)
    }
    if (sessions.length === 0 && selectedSessionId) {
      setSelectedSessionId('')
    }
  }, [selectedSessionId, sessions])

  useEffect(() => {
    setHistoryPage(1)
    setHistoryItems([])
  }, [selectedSessionId])

  useEffect(() => {
    const selected = sessions.find((s) => s.id === selectedSessionId)
    setEditingTitle(selected?.title || '')
  }, [selectedSessionId, sessions])

  useEffect(() => {
    const freshItems = sessionDetail?.messages || []
    if (!selectedSessionId) return
    if (historyPage === 1) {
      setHistoryItems(freshItems)
      return
    }
    setHistoryItems((prev) => {
      const existing = new Set(prev.map((item) => item.id))
      const merged = [...prev]
      for (const item of freshItems) {
        if (!existing.has(item.id)) merged.push(item)
      }
      return merged
    })
  }, [historyPage, selectedSessionId, sessionDetail])

  const handleCreateSession = () => {
    createSession(
      { title: 'Owner AI Session' },
      {
        onSuccess: (result) => {
          if (result?.session?.id) {
            setSelectedSessionId(result.session.id)
          }
        },
      },
    )
  }

  const submitPrompt = (value) => {
    const text = String(value || '').trim()
    if (!text || !selectedSessionId) return

    runSnapshot(
      {
        sessionId: selectedSessionId,
        prompt: text,
        daysAhead: 30,
        limit: 10,
      },
      {
        onSuccess: () => {
          setHistoryPage(1)
          setPrompt('')
        },
      },
    )
  }

  const handleRenameSession = () => {
    if (!selectedSessionId || !editingTitle.trim()) return
    renameSession({
      sessionId: selectedSessionId,
      title: editingTitle.trim(),
    })
  }

  const handleDeleteSession = () => {
    if (!selectedSessionId) return
    const confirmed = window.confirm('Delete this session and all snapshots? This cannot be undone.')
    if (!confirmed) return
    const deletingId = selectedSessionId
    deleteSession(
      { sessionId: deletingId },
      {
        onSuccess: () => {
          const next = sessions.find((s) => s.id !== deletingId)
          setSelectedSessionId(next?.id || '')
        },
      },
    )
  }
  const messages = historyItems
  const historyHasMore = !!sessionDetail?.pagination?.hasMore

  if (!isOwner) {
    return (
      <PageContainer title="AI Assistant">
        <Alert severity="warning">This workspace is available to landlord/owner accounts only.</Alert>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="AI Assistant">
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SmartToyIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={700}>Owner AI Workspace</Typography>
              <Chip size="small" icon={<QueryStatsIcon />} label="Data-scoped" color="primary" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Ask portfolio questions in one place. Responses use owner-scoped data snapshots and avoid implicit state changes.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                placeholder="Ask about dues, past due tenants, balances, or maintenance status..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitPrompt(prompt)
                  }
                }}
                disabled={isPending || !selectedSessionId}
              />
              <Button
                variant="contained"
                onClick={() => submitPrompt(prompt)}
                disabled={isPending || !prompt.trim() || !selectedSessionId}
              >
                {isPending ? 'Thinking...' : 'Ask'}
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {QUICK_PROMPTS.map((qp) => (
                <Chip
                  key={qp}
                  label={qp}
                  variant="outlined"
                  size="small"
                  onClick={() => submitPrompt(qp)}
                  disabled={!selectedSessionId || isPending}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>
            {!selectedSessionId && (
              <Alert severity="info">
                Create a session to start a persistent owner AI conversation.
              </Alert>
            )}
            {error && (
              <Alert severity="error">
                {error?.response?.data?.error || 'Unable to run owner snapshot right now.'}
              </Alert>
            )}
          </Stack>
        </Paper>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
          <Paper variant="outlined" sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">Sessions</Typography>
              <Button size="small" onClick={handleCreateSession} disabled={creatingSession}>
                {creatingSession ? 'Creating...' : 'New'}
              </Button>
            </Stack>
            <Box sx={{ px: 1.5, pb: 1.25 }}>
              <TextField
                size="small"
                fullWidth
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions"
              />
            </Box>
            <Divider />
            {sessionsLoading ? (
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} /></Box>
            ) : sessionsError ? (
              <Alert severity="error" sx={{ m: 1 }}>Unable to load sessions.</Alert>
            ) : sessions.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">No sessions yet.</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {sessions.map((session) => (
                  <ListItemButton
                    key={session.id}
                    selected={session.id === selectedSessionId}
                    onClick={() => {
                      setSelectedSessionId(session.id)
                      setHistoryPage(1)
                    }}
                  >
                    <ListItemText
                      primary={session.title}
                      secondary={`${session.message_count || 0} snapshot(s)`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>

          <Stack spacing={1.25} sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">Session history</Typography>
            {selectedSessionId && (
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    placeholder="Session title"
                  />
                  <Button size="small" variant="outlined" onClick={handleRenameSession} disabled={renamingSession || !editingTitle.trim()}>
                    Rename
                  </Button>
                  <Button size="small" color="error" onClick={handleDeleteSession} disabled={deletingSession}>
                    Delete
                  </Button>
                </Stack>
              </Paper>
            )}
            {detailLoading && selectedSessionId ? (
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={22} />
              </Paper>
            ) : detailError && selectedSessionId ? (
              <Alert severity="error">Unable to load the selected session.</Alert>
            ) : messages.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No snapshot history yet. Ask your first owner question above.
                </Typography>
              </Paper>
            ) : (
              <>
                {messages.map((entry) => (
                  <Box key={entry.id}>
                    <Paper variant="outlined" sx={{ p: 1.25, mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {new Date(entry.created_at).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {entry.prompt}
                      </Typography>
                    </Paper>
                    <OwnerQaSnapshotCard snapshot={entry.snapshot} />
                  </Box>
                ))}
                {historyHasMore && (
                  <Button
                    variant="outlined"
                    onClick={() => setHistoryPage((p) => p + 1)}
                    disabled={detailLoading}
                  >
                    {detailLoading ? 'Loading...' : 'Load older snapshots'}
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Stack>
      </Stack>
    </PageContainer>
  )
}
