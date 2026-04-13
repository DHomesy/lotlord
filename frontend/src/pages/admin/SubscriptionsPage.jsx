import { Chip, Typography } from '@mui/material'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import { useLandlordSubscriptions } from '../../hooks/useBilling'

const STATUS_COLOR = {
  active:     'success',
  trialing:   'info',
  past_due:   'warning',
  incomplete: 'error',
  canceled:   'default',
  none:       'default',
}

const columns = [
  {
    field: 'first_name',
    headerName: 'Name',
    width: 200,
    renderCell: ({ row }) => `${row.first_name} ${row.last_name}`,
  },
  { field: 'email', headerName: 'Email', flex: 1 },
  {
    field: 'subscription_status',
    headerName: 'Status',
    width: 140,
    renderCell: ({ value }) => (
      <Chip
        label={value ?? 'none'}
        color={STATUS_COLOR[value] ?? 'default'}
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: 'subscription_plan',
    headerName: 'Plan',
    width: 180,
    valueFormatter: (v) => v ?? '—',
  },
]

export default function SubscriptionsPage() {
  const { data = [], isLoading } = useLandlordSubscriptions()

  return (
    <PageContainer title="Subscriptions">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        All landlord accounts and their current SaaS subscription status.
      </Typography>
      <DataTable rows={data} columns={columns} loading={isLoading} />
    </PageContainer>
  )
}
