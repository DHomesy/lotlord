import { useState } from 'react'
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import LeasePicker from '../../components/pickers/LeasePicker'
import { useLedger, usePortfolioSummary } from '../../hooks/useLedger'
import { useProperties } from '../../hooks/useProperties'
import { useMySubscription } from '../../hooks/useBilling'
import { hasStarter } from '../../lib/plans'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// ─── Lease Ledger columns ─────────────────────────────────────────────────────

const fmtMoney = (v) => {
  const n = Number(v)
  return n < 0 ? `-$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

const ledgerColumns = [
  { field: 'effective_date', headerName: 'Date', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
  { field: 'entry_type', headerName: 'Type', width: 110, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'description', headerName: 'Description', flex: 1.5 },
  { field: 'amount',        headerName: 'Amount',       width: 130, valueFormatter: fmtMoney },
  { field: 'balance_after', headerName: 'Balance',      width: 130, valueFormatter: fmtMoney },
  { field: 'created_by_name', headerName: 'Recorded By', width: 150 },
]

// ─── Portfolio Summary columns ────────────────────────────────────────────────

const fmt = (v) => `$${Number(v ?? 0).toLocaleString()}`

const portfolioColumns = [
  { field: 'propertyName', headerName: 'Property', flex: 1 },
  { field: 'address',      headerName: 'Address',  flex: 1.5 },
  { field: 'unitCount',    headerName: 'Units',    width: 70 },
  { field: 'totalCharged',   headerName: 'Charged',   width: 130, valueFormatter: fmt },
  { field: 'totalCollected', headerName: 'Collected', width: 130, valueFormatter: fmt },
  { field: 'outstanding',    headerName: 'Outstanding', width: 130,
    renderCell: ({ value }) => (
      <Typography variant="body2" color={value > 0 ? 'error.main' : 'text.primary'} fontWeight={value > 0 ? 600 : 400}>
        {fmt(value)}
      </Typography>
    ),
  },
  { field: 'netIncome', headerName: 'Net Income', width: 130, valueFormatter: fmt },
]

// ─── Portfolio Tab ─────────────────────────────────────────────────────────────

function PortfolioTab() {
  const [filterPropertyId, setFilterPropertyId] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const { data: subscription } = useMySubscription()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isStarter = hasStarter(subscription) || user?.role === 'admin'

  const { data: propsData } = useProperties()
  const properties = Array.isArray(propsData) ? propsData : (propsData?.properties ?? [])

  const params = {
    ...(filterPropertyId ? { propertyId: filterPropertyId } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate   ? { toDate }   : {}),
  }
  const { data: summary = [], isLoading } = usePortfolioSummary(params)

  const rows = summary.map((p) => ({ ...p, id: p.propertyId }))

  // Aggregate totals across all rows in view
  const totals = rows.reduce(
    (acc, r) => ({
      charged:   acc.charged   + (r.totalCharged   ?? 0),
      collected: acc.collected + (r.totalCollected ?? 0),
      outstanding: acc.outstanding + (r.outstanding ?? 0),
      netIncome: acc.netIncome + (r.netIncome ?? 0),
    }),
    { charged: 0, collected: 0, outstanding: 0, netIncome: 0 },
  )

  return (
    <Stack spacing={2}>
      {!isStarter && (
        <Alert
          severity="info"
          action={
            <Button
              variant="contained"
              size="small"
              onClick={() => navigate('/profile')}
            >
              Upgrade Plan
            </Button>
          }
        >
          <strong>Portfolio Summary</strong> is a Starter plan feature. Upgrade to view cross-property
          income, outstanding balances, and net income analytics.
        </Alert>
      )}

      {isStarter && (
      <>
      {/* ── Filters ── */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ maxWidth: 800 }}>
        <TextField
          select
          label="Property"
          value={filterPropertyId ?? ''}
          onChange={(e) => setFilterPropertyId(e.target.value || null)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Properties</MenuItem>
          {properties.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField
          label="From"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          sx={{ width: 170 }}
        />
        <TextField
          label="To"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          sx={{ width: 170 }}
        />
      </Stack>

      {/* ── Summary cards ── */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
        {[
          { label: 'Total Charged',   value: totals.charged,     color: undefined },
          { label: 'Total Collected', value: totals.collected,   color: 'success.main' },
          { label: 'Outstanding',     value: totals.outstanding, color: totals.outstanding > 0 ? 'error.main' : undefined },
          { label: 'Net Income',      value: totals.netIncome,   color: 'success.main' },
        ].map(({ label, value, color }) => (
          <Paper key={label} variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6" fontWeight={600} color={color}>
              {fmt(value)}
            </Typography>
          </Paper>
        ))}
      </Stack>

      <DataTable rows={rows} columns={portfolioColumns} loading={isLoading} />
      </>
      )}
    </Stack>
  )
}

// ─── Ledger Tab ─────────────────────────────────────────────────────────────

function LedgerTab() {
  const [leaseId, setLeaseId] = useState(null)
  const { data, isLoading } = useLedger(leaseId ? { leaseId } : undefined)

  const entries      = Array.isArray(data) ? data : (data?.entries ?? [])
  const balance       = data?.currentBalance ?? null
  const amountDueNow = data?.amountDueNow ?? null
  const lease        = data?.lease ?? null

  return (
    <Stack spacing={2}>
      <LeasePicker
        value={leaseId}
        onChange={setLeaseId}
        label="Select Lease to View"
        helperText="Choose a lease to load its full transaction history"
        onlyActive={false}
      />

      {leaseId && !isLoading && !data && (
        <Typography color="text.secondary">No ledger entries found for this lease.</Typography>
      )}

      {lease && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start" flexWrap="wrap">
          <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary">Tenant</Typography>
            <Typography variant="body1" fontWeight={600}>
              {[lease.first_name, lease.last_name].filter(Boolean).join(' ') || '—'}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary">Property / Unit</Typography>
            <Typography variant="body1" fontWeight={600}>
              {lease.property_name || '—'}{lease.unit_number ? ` — Unit ${lease.unit_number}` : ''}
            </Typography>
            {lease.address_line1 && (
              <Typography variant="caption" color="text.secondary">{lease.address_line1}</Typography>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary">Amount Due Today</Typography>
            <Typography
              variant="body1"
              fontWeight={600}
              color={amountDueNow > 0 ? 'error.main' : 'success.main'}
            >
              {amountDueNow !== null ? fmtMoney(amountDueNow) : '—'}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary">Ledger Balance</Typography>
            <Typography variant="body1" fontWeight={600} color="text.secondary">
              {balance !== null ? fmtMoney(balance) : '—'}
            </Typography>
            <Typography variant="caption" color="text.disabled">Includes future charges</Typography>
          </Paper>
        </Stack>
      )}

      {!leaseId && (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          Select a lease above to view its transaction history.
        </Typography>
      )}

      {leaseId && (
        <DataTable rows={entries} columns={ledgerColumns} loading={isLoading} />
      )}
    </Stack>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [tab, setTab] = useState(0)

  return (
    <PageContainer title="Ledger">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Lease Ledger" />
        <Tab label="Portfolio Summary" />
      </Tabs>

      {tab === 0 && <LedgerTab />}
      {tab === 1 && <PortfolioTab />}
    </PageContainer>
  )
}
