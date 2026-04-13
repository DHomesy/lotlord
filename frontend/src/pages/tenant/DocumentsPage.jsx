import { IconButton, Tooltip, Chip, Stack } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import { useDocuments, useDownloadDocument } from '../../hooks/useDocuments'

export default function TenantDocumentsPage() {
  const { data, isLoading } = useDocuments()
  const { mutate: download, isPending: downloading } = useDownloadDocument()
  const rows = Array.isArray(data) ? data : (data?.documents ?? [])

  const columns = [
    { field: 'file_name', headerName: 'File', flex: 1.5 },
    {
      field: 'category', headerName: 'Category', width: 120,
      renderCell: ({ value }) => value ? <Chip label={value} size="small" /> : null,
    },
    { field: 'uploaded_by_name', headerName: 'Shared By', width: 150 },
    {
      field: 'created_at', headerName: 'Date', width: 110,
      valueFormatter: (v) => v?.slice(0, 10),
    },
    {
      field: 'actions', headerName: '', width: 70, sortable: false,
      renderCell: ({ row }) => (
        <Tooltip title="Download">
          <IconButton size="small" onClick={() => download(row.id)} disabled={downloading}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  return (
    <PageContainer title="My Documents">
      <DataTable rows={rows} columns={columns} loading={isLoading} />
    </PageContainer>
  )
}
