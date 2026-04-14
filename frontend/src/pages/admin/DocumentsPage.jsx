import { useRef, useState } from 'react'
import {
  Box, Button, Chip, FormControl, IconButton, InputLabel, MenuItem,
  Select, Stack, Tab, Tabs, TextField, Tooltip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import UploadIcon from '@mui/icons-material/Upload'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import FolderIcon from '@mui/icons-material/Folder'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import UnitPicker from '../../components/pickers/UnitPicker'
import TenantPicker from '../../components/pickers/TenantPicker'
import LeasePicker from '../../components/pickers/LeasePicker'
import { useDocuments, useUploadDocument, useDeleteDocument, useDownloadDocument } from '../../hooks/useDocuments'
import { useProperties } from '../../hooks/useProperties'

const CATEGORIES = ['lease', 'id', 'insurance', 'inspection', 'receipt', 'photo', 'notice', 'other']

const TABS = [
  { label: 'All',        value: null },
  { label: 'Properties', value: 'property' },
  { label: 'Tenants',    value: 'tenant' },
  { label: 'Leases',     value: 'lease' },
  { label: 'Units',      value: 'unit' },
  { label: 'Unlinked',   value: '__unlinked__' },
]

// ── Property picker (inline, no existing picker component) ──────────────────
function PropertySelect({ value, onChange }) {
  const { data } = useProperties()
  const properties = Array.isArray(data) ? data : (data?.properties ?? [])
  return (
    <FormControl fullWidth size="small">
      <InputLabel>Property</InputLabel>
      <Select value={value ?? ''} label="Property" onChange={(e) => onChange(e.target.value || null)}>
        <MenuItem value=""><em>None</em></MenuItem>
        {properties.map((p) => (
          <MenuItem key={p.id} value={p.id}>{p.name || p.address_line1}</MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

// ── Upload dialog ─────────────────────────────────────────────────────────────
function UploadDialog({ open, file, onClose, onConfirm, uploading }) {
  const [category, setCategory]       = useState('')
  const [relatedType, setRelatedType] = useState('')
  const [relatedId, setRelatedId]     = useState(null)

  const handleClose = () => {
    setCategory(''); setRelatedType(''); setRelatedId(null)
    onClose()
  }

  const handleConfirm = () => {
    onConfirm({ category, relatedType: relatedType || null, relatedId })
    setCategory(''); setRelatedType(''); setRelatedId(null)
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Upload Document</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" noWrap>{file?.name}</Typography>

          <FormControl fullWidth size="small">
            <InputLabel>Category (optional)</InputLabel>
            <Select value={category} label="Category (optional)" onChange={(e) => setCategory(e.target.value)}>
              <MenuItem value=""><em>None</em></MenuItem>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel>Link to (optional)</InputLabel>
            <Select
              value={relatedType}
              label="Link to (optional)"
              onChange={(e) => { setRelatedType(e.target.value); setRelatedId(null) }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              <MenuItem value="property">Property</MenuItem>
              <MenuItem value="tenant">Tenant</MenuItem>
              <MenuItem value="lease">Lease</MenuItem>
              <MenuItem value="unit">Unit</MenuItem>
            </Select>
          </FormControl>

          {relatedType === 'property' && (
            <PropertySelect value={relatedId} onChange={setRelatedId} />
          )}
          {relatedType === 'tenant' && (
            <TenantPicker value={relatedId} onChange={setRelatedId} label="Tenant" includePending />
          )}
          {relatedType === 'lease' && (
            <LeasePicker value={relatedId} onChange={setRelatedId} onlyActive={false} label="Lease" />
          )}
          {relatedType === 'unit' && (
            <UnitPicker value={relatedId} onChange={setRelatedId} label="Unit" />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const inputRef = useRef()
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [tabIndex, setTabIndex]       = useState(0)
  const [search, setSearch]           = useState('')

  const activeTab = TABS[tabIndex]
  const queryParams = activeTab.value && activeTab.value !== '__unlinked__'
    ? { relatedType: activeTab.value }
    : {}

  const { data, isLoading } = useDocuments(queryParams)
  const { mutate: upload, isPending: uploading } = useUploadDocument()
  const { mutate: del }                          = useDeleteDocument()
  const { mutate: download, isPending: downloading } = useDownloadDocument()

  let rows = Array.isArray(data) ? data : (data?.documents ?? [])

  // Client-side filter for "Unlinked" tab
  if (activeTab.value === '__unlinked__') {
    rows = rows.filter((r) => !r.related_type)
  }

  // Client-side search filter
  if (search.trim()) {
    const q = search.toLowerCase()
    rows = rows.filter(
      (r) => r.file_name?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q),
    )
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPendingFile(file)
    setUploadOpen(true)
    e.target.value = ''
  }

  const handleUploadConfirm = ({ category, relatedType, relatedId }) => {
    if (!pendingFile) return
    const fd = new FormData()
    fd.append('file', pendingFile)
    if (category)    fd.append('category', category)
    if (relatedType) fd.append('relatedType', relatedType)
    if (relatedId)   fd.append('relatedId', relatedId)
    upload(fd, {
      onSuccess: () => { setUploadOpen(false); setPendingFile(null) },
    })
  }

  const columns = [
    {
      field: 'file_name', headerName: 'File', flex: 1.5,
      renderCell: ({ value }) => (
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <FolderIcon fontSize="small" color="action" />
          <Typography variant="body2" noWrap>{value}</Typography>
        </Stack>
      ),
    },
    {
      field: 'category', headerName: 'Category', width: 120,
      renderCell: ({ value }) => value
        ? <Chip label={value} size="small" variant="outlined" />
        : null,
    },
    {
      field: 'related_type', headerName: 'Linked To', width: 130,
      renderCell: ({ value }) => value
        ? <Chip label={value.replace('_', ' ')} size="small" color="info" variant="outlined" />
        : <Typography variant="body2" color="text.disabled">—</Typography>,
    },
    { field: 'uploaded_by_name', headerName: 'Uploaded By', width: 160 },
    {
      field: 'created_at', headerName: 'Date', width: 110,
      valueFormatter: (v) => v?.slice(0, 10),
    },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Download">
            <IconButton size="small" onClick={() => download(row.id)} disabled={downloading}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => del(row.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  return (
    <PageContainer
      title="Documents"
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
            onChange={handleFileSelect}
          />
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => inputRef.current.click()}>
            Upload
          </Button>
        </>
      }
    >
      {/* Search + tabs */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by filename or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 260 } }}
        />
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
        </Tabs>
      </Box>

      <DataTable rows={rows} columns={columns} loading={isLoading} />

      <UploadDialog
        open={uploadOpen}
        file={pendingFile}
        onClose={() => { setUploadOpen(false); setPendingFile(null) }}
        onConfirm={handleUploadConfirm}
        uploading={uploading}
      />
    </PageContainer>
  )
}

