import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import InsightsIcon from '@mui/icons-material/Insights'

function fmtMoney(v) {
  return `$${Number(v || 0).toFixed(2)}`
}

function getRowLabel(item) {
  if (item.tenant_name) return item.tenant_name
  if (item.title) return item.title
  if (item.charge_id) return `Charge ${item.charge_id.slice(0, 8)}`
  return 'Item'
}

function getRowMeta(item) {
  if (item.amount_due !== undefined) {
    return `Due ${item.due_date || ''} - ${fmtMoney(item.amount_due)}`
  }
  if (item.overdue_amount !== undefined) {
    return `Overdue ${fmtMoney(item.overdue_amount)} (${item.overdue_charges || 0} charges)`
  }
  if (item.balance !== undefined) {
    return `Balance ${fmtMoney(item.balance)}`
  }
  if (item.status) {
    return `${item.status}${item.priority ? ` - ${item.priority}` : ''}`
  }
  return ''
}

export default function OwnerQaSnapshotCard({ snapshot }) {
  const [expanded, setExpanded] = useState(false)

  const topItems = useMemo(() => {
    const items = Array.isArray(snapshot?.items) ? snapshot.items : []
    return items.slice(0, 5)
  }, [snapshot])

  if (!snapshot) return null

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        mb: 1.5,
        bgcolor: 'info.50',
        borderColor: 'info.light',
      }}
    >
      <Stack spacing={0.9}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
          <InsightsIcon sx={{ fontSize: 15, color: 'info.main' }} />
          <Typography variant="caption" fontWeight={700}>
            {snapshot.title || 'Owner Q&A Snapshot'}
          </Typography>
          <Chip
            size="small"
            label={snapshot.intent}
            color="info"
            variant="outlined"
            sx={{ height: 18, fontSize: 10, textTransform: 'lowercase' }}
          />
        </Stack>

        <Typography variant="body2">{snapshot.summary}</Typography>

        {snapshot.dateContext?.daysAhead ? (
          <Typography variant="caption" color="text.secondary">
            Window: next {snapshot.dateContext.daysAhead} days
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">
            As of: {snapshot.dateContext?.date || snapshot.generatedAt?.slice(0, 10) || 'today'}
          </Typography>
        )}

        {!!snapshot.policyNote && (
          <Alert severity="info" sx={{ py: 0.25 }}>
            {snapshot.policyNote}
          </Alert>
        )}

        <Button
          size="small"
          variant="text"
          onClick={() => setExpanded((v) => !v)}
          sx={{ alignSelf: 'flex-start', px: 0 }}
        >
          {expanded ? 'Hide details' : 'Show details'}
        </Button>

        {expanded && (
          <Stack spacing={0.75}>
            {topItems.length === 0 && (
              <Typography variant="caption" color="text.secondary">No matching rows.</Typography>
            )}
            {topItems.map((item, idx) => (
              <Box key={`${getRowLabel(item)}-${idx}`} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.6 }}>
                <Typography variant="caption" fontWeight={600}>
                  {getRowLabel(item)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {getRowMeta(item)}
                </Typography>
              </Box>
            ))}
            {Array.isArray(snapshot.breakdown) && snapshot.breakdown.length > 0 && (
              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.6 }}>
                <Typography variant="caption" fontWeight={700}>
                  Status breakdown
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.4 }} flexWrap="wrap">
                  {snapshot.breakdown.map((row, idx) => (
                    <Chip
                      key={`breakdown-${idx}`}
                      size="small"
                      label={`${row.status}/${row.priority}: ${row.count}`}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10 }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}
