import { useState } from 'react'
import {
  Box, Grid, TextField, MenuItem, Typography, Tooltip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import { useAuditLog } from '../../hooks/useAudit'

const RESOURCE_TYPES = ['', 'payment', 'charge', 'lease', 'maintenance', 'user']

// ── Metadata viewer dialog ────────────────────────────────────────────────────
function MetadataDialog({ entry, onClose }) {
  return (
    <Dialog open={!!entry} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Event Detail</DialogTitle>
      <DialogContent>
        {entry && (
          <Box component="pre" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', mt: 1 }}>
            {JSON.stringify(
              {
                id: entry.id,
                action: entry.action,
                resource_type: entry.resource_type,
                resource_id: entry.resource_id,
                actor: entry.actor_name ? `${entry.actor_name} (${entry.actor_email})` : 'system',
                ip: entry.ip_address,
                created_at: entry.created_at,
                metadata: entry.metadata,
              },
              null,
              2,
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [filters, setFilters] = useState({ resourceType: '', action: '', startDate: '', endDate: '' })
  const [selectedEntry, setSelectedEntry] = useState(null)

  const { data = [], isLoading } = useAuditLog({
    resourceType: filters.resourceType || undefined,
    action: filters.action || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate ? `${filters.endDate}T23:59:59Z` : undefined,
  })

  function update(key, val) {
    setFilters((prev) => ({ ...prev, [key]: val }))
  }

  const columns = [
    {
      field: 'created_at',
      headerName: 'Time',
      width: 170,
      valueFormatter: (v) => v ? new Date(v).toLocaleString() : '',
    },
    { field: 'action', headerName: 'Action', width: 200 },
    { field: 'resource_type', headerName: 'Resource', width: 120 },
    { field: 'actor_name', headerName: 'Actor', width: 160, valueFormatter: (v) => v || 'system' },
    { field: 'ip_address', headerName: 'IP', width: 130 },
    {
      field: 'detail',
      headerName: '',
      width: 60,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <Tooltip title="View details">
          <IconButton size="small" onClick={() => setSelectedEntry(row)}>
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  return (
    <PageContainer title="Audit Log">
      {/* ── Filters ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4} md={3}>
          <TextField
            select
            label="Resource Type"
            value={filters.resourceType}
            onChange={(e) => update('resourceType', e.target.value)}
            size="small"
            fullWidth
          >
            <MenuItem value="">All</MenuItem>
            {RESOURCE_TYPES.filter(Boolean).map((t) => (
              <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4} md={3}>
          <TextField
            label="Action prefix"
            placeholder="e.g. payment"
            value={filters.action}
            onChange={(e) => update('action', e.target.value)}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={4} md={2}>
          <TextField
            label="From date"
            type="date"
            value={filters.startDate}
            onChange={(e) => update('startDate', e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={4} md={2}>
          <TextField
            label="To date"
            type="date"
            value={filters.endDate}
            onChange={(e) => update('endDate', e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
      </Grid>

      {/* ── Result count ── */}
      {!isLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {data.length} event{data.length !== 1 ? 's' : ''}
        </Typography>
      )}

      <DataTable rows={data} columns={columns} loading={isLoading} />

      <MetadataDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </PageContainer>
  )
}
