import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import { Typography } from '@mui/material'
import { usePayments } from '../../hooks/usePayments'
import { useMyLease } from '../../hooks/useTenants'

const columns = [
  { field: 'created_at', headerName: 'Date', width: 130, valueFormatter: (v) => v?.slice(0, 10) },
  { field: 'amount_paid', headerName: 'Amount', width: 130, valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
  { field: 'payment_method', headerName: 'Method', width: 140 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
  { field: 'notes', headerName: 'Notes', flex: 1 },
]

export default function TenantPaymentsPage() {
  const { activeLease, leases, isLoading: loadingLease } = useMyLease()
  const activeLeaseFallback = activeLease ?? leases[0]

  const { data, isLoading: loadingPayments } = usePayments(
    activeLeaseFallback?.id ? { leaseId: activeLeaseFallback.id } : undefined,
  )
  const rows = Array.isArray(data) ? data : (data?.payments ?? [])

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
      <DataTable rows={rows} columns={columns} loading={loadingPayments} />
    </PageContainer>
  )
}
