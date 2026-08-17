import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import PageContainer from '../../components/layout/PageContainer'
import OwnerQaSnapshotCard from '../../components/ai/OwnerQaSnapshotCard'
import { useOwnerQaSnapshot } from '../../hooks/useInbox'
import { useAuthStore } from '../../store/authStore'

const QUICK_PROMPTS = [
  'What dues are coming up in the next 30 days?',
  'Which tenants are currently past due?',
  'Show me tenant balances with positive amounts only.',
  'Give me maintenance status including completed work.',
]

function loadHistory(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function OwnerAssistantPage() {
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'landlord'
  const historyKey = useMemo(() => `owner-ai-history:${user?.sub || 'unknown'}`, [user?.sub])

  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState([])

  const {
    mutate: runSnapshot,
    isPending,
    error,
  } = useOwnerQaSnapshot()

  useEffect(() => {
    if (!isOwner) return
    setHistory(loadHistory(historyKey))
  }, [historyKey, isOwner])

  useEffect(() => {
    if (!isOwner) return
    localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 30)))
  }, [history, historyKey, isOwner])

  const submitPrompt = (value) => {
    const text = String(value || '').trim()
    if (!text) return

    runSnapshot(
      {
        prompt: text,
        daysAhead: 30,
        limit: 10,
      },
      {
        onSuccess: (result) => {
          const snapshot = result?.snapshot
          if (!snapshot) return
          setHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              prompt: text,
              createdAt: new Date().toISOString(),
              snapshot,
            },
            ...prev,
          ])
          setPrompt('')
        },
      },
    )
  }

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
                disabled={isPending}
              />
              <Button
                variant="contained"
                onClick={() => submitPrompt(prompt)}
                disabled={isPending || !prompt.trim()}
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
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>
            {error && (
              <Alert severity="error">
                {error?.response?.data?.error || 'Unable to run owner snapshot right now.'}
              </Alert>
            )}
          </Stack>
        </Paper>

        <Stack spacing={1.25}>
          <Typography variant="subtitle2" color="text.secondary">Recent AI snapshots</Typography>
          {history.length === 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No snapshot history yet. Ask your first owner question above.
              </Typography>
            </Paper>
          )}
          {history.map((entry) => (
            <Box key={entry.id}>
              <Paper variant="outlined" sx={{ p: 1.25, mb: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  {new Date(entry.createdAt).toLocaleString()}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {entry.prompt}
                </Typography>
              </Paper>
              <OwnerQaSnapshotCard snapshot={entry.snapshot} />
            </Box>
          ))}
        </Stack>
      </Stack>
    </PageContainer>
  )
}
