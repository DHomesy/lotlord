import { useState } from 'react'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import { Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ReceiptIcon from '@mui/icons-material/Receipt'
import DownloadIcon from '@mui/icons-material/Download'
import { usePayments } from '../../hooks/usePayments'
import { useMyLease } from '../../hooks/useTenants'
import { getReceipt } from '../../api/payments'
import { getStatementPdf } from '../../api/ledger'

/** Trigger a browser file download from a Blob or data */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ReceiptButton({ paymentId }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const blob = await getReceipt(paymentId)
      triggerDownload(blob, `receipt-${paymentId}.pdf`)
    } catch {
      // silently ignore — no global error toast needed for optional download
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tooltip title="Download receipt">
      <span>
        <IconButton onClick={handleDownload} disabled={loading} sx={{ minWidth: 44, minHeight: 44 }}>
          {loading ? <CircularProgress size={18} /> : <ReceiptIcon />}
        </IconButton>
      </span>
    </Tooltip>
  )
}

const columns = [
  { field: 'created_at', headerName: 'Date', width: 130, valueFormatter: (v) => v?.slice(0, 10) },
  { field: 'amount_paid', headerName: 'Amount', width: 130, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
  { field: 'payment_method', headerName: 'Method', width: 140 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'notes', headerName: 'Notes', flex: 1 },
  {
    field: 'actions',
    headerName: '',
    width: 60,
    sortable: false,
    renderCell: ({ row }) => <ReceiptButton paymentId={row.id} />,
  },
]

export default function TenantPaymentsPage() {
  const { activeLease, leases, isLoading: loadingLease } = useMyLease()
  const activeLeaseFallback = activeLease ?? leases[0]
  const [exporting, setExporting] = useState(false)

  const { data, isLoading: loadingPayments } = usePayments(
    activeLeaseFallback?.id ? { leaseId: activeLeaseFallback.id } : undefined,
  )
  const rows = Array.isArray(data) ? data : (data?.payments ?? [])

  async function handleStatementDownload() {
    if (!activeLeaseFallback?.id) return
    setExporting(true)
    try {
      const blob = await getStatementPdf({ leaseId: activeLeaseFallback.id })
      triggerDownload(blob, `statement-${activeLeaseFallback.id}.pdf`)
    } catch {
      // silently ignore
    } finally {
      setExporting(false)
    }
  }

  if (loadingLease) return <LoadingOverlay />

  if (!activeLeaseFallback) {
    return (
      <PageContainer title="My Payments">
        <Typography color="text.secondary">No lease found — no payment history to display.</Typography>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="My Payments">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent={{ xs: 'stretch', sm: 'flex-end' }}
        sx={{ mb: 2 }}
      >
        <Button
          variant="outlined"
          fullWidth={false}
          sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}
          startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
          onClick={handleStatementDownload}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Download Statement (PDF)'}
        </Button>
      </Stack>
      <DataTable rows={rows} columns={columns} loading={loadingPayments} />
    </PageContainer>
  )
}

