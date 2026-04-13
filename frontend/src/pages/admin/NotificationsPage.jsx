import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import StatusChip from '../../components/common/StatusChip'
import { useNotificationLog } from '../../hooks/useNotifications'

const columns = [
  { field: 'created_at', headerName: 'Sent', width: 130, valueFormatter: (v) => v?.slice(0, 16).replace('T', ' ') },
  { field: 'channel', headerName: 'Channel', width: 90 },
  { field: 'subject', headerName: 'Subject', flex: 1.5 },
  { field: 'status', headerName: 'Status', width: 110, renderCell: ({ value }) => <StatusChip status={value} /> },
]

export default function NotificationsPage() {
  const { data, isLoading } = useNotificationLog()
  const rows = Array.isArray(data) ? data : (data?.log ?? [])

  return (
    <PageContainer title="Notifications Log">
      <DataTable rows={rows} columns={columns} loading={isLoading} />
    </PageContainer>
  )
}
