import { useRef, useState } from 'react'
import {
  Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import SaveIcon from '@mui/icons-material/Save'
import ImageIcon from '@mui/icons-material/Image'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import StatusChip from '../common/StatusChip'
import {
  useMaintenanceAttachments,
  useAddAttachment,
  useRemoveAttachment,
  useDownloadAttachment,
  useUpdateMaintenanceRequest,
} from '../../hooks/useMaintenance'

const STATUSES   = ['open', 'in_progress', 'completed', 'cancelled']
const PRIORITIES = ['low', 'medium', 'high', 'emergency']
const CATEGORIES = ['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other']

const PRIORITY_COLORS = {
  emergency: 'error',
  high:      'warning',
  medium:    'info',
  low:       'default',
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function AttachmentIcon({ fileType }) {
  if (IMAGE_TYPES.has(fileType)) return <ImageIcon fontSize="small" color="info" />
  if (fileType === 'application/pdf') return <PictureAsPdfIcon fontSize="small" color="error" />
  return <InsertDriveFileIcon fontSize="small" color="action" />
}

/**
 * MaintenanceDetailDrawer
 *
 * Right-side drawer that shows full detail for a maintenance request.
 * Landlords/admins can update status/priority/description and manage attachments.
 * Tenants can view and add photos.
 *
 * Props:
 *   request   – the maintenance_request row (null = closed)
 *   onClose   – () => void
 *   readonly  – bool (tenant view hides destructive actions)
 */
export default function MaintenanceDetailDrawer({ request, onClose, readonly = false }) {
  const fileInputRef = useRef()
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusValue, setStatusValue]     = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [detailFields, setDetailFields]   = useState({})

  const { data: attachments = [], isLoading: loadingAttachments } = useMaintenanceAttachments(request?.id)
  const { mutate: addAttachment, isPending: uploading }           = useAddAttachment(request?.id)
  const { mutate: removeAttachment }                              = useRemoveAttachment(request?.id)
  const { mutate: downloadAttachment, isPending: downloading }    = useDownloadAttachment()
  const { mutate: updateRequest, isPending: saving }              = useUpdateMaintenanceRequest(request?.id)

  if (!request) return null

  const handleFileInput = (e) => {
    const selected = Array.from(e.target.files)
    selected.forEach((file) => addAttachment(file))
    e.target.value = ''
  }

  const handleStatusSave = () => {
    updateRequest({ status: statusValue }, { onSuccess: () => setEditingStatus(false) })
  }

  const handleDetailsSave = () => {
    updateRequest(detailFields, { onSuccess: () => setEditingDetails(false) })
  }

  const startEditingDetails = () => {
    setDetailFields({
      title:       request.title,
      description: request.description ?? '',
      category:    request.category,
      priority:    request.priority,
    })
    setEditingDetails(true)
  }

  return (
    <Drawer
      anchor="right"
      open={!!request}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 0 } }}
    >
      {/* ── Header ── */}
      <Box sx={{ px: 3, pt: 3, pb: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
            {request.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {[request.property_address, request.unit_number ? `Unit ${request.unit_number}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ px: 3, py: 2, overflowY: 'auto', flex: 1 }}>

        {/* ── Status + Priority chips ── */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
          <StatusChip status={request.status} />
          <Chip
            label={request.priority}
            color={PRIORITY_COLORS[request.priority] || 'default'}
            size="small"
            variant="outlined"
          />
          <Chip label={request.category} size="small" variant="outlined" />
        </Stack>

        {/* ── Status update (landlord/admin only) ── */}
        {!readonly && (
          <Box sx={{ mb: 3 }}>
            {editingStatus ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Status"
                  value={statusValue}
                  onChange={(e) => setStatusValue(e.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  {STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleStatusSave}
                  disabled={saving || !statusValue}
                >
                  Save
                </Button>
                <Button size="small" onClick={() => setEditingStatus(false)}>
                  Cancel
                </Button>
              </Stack>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={() => { setStatusValue(request.status); setEditingStatus(true) }}
              >
                Update Status
              </Button>
            )}
          </Box>
        )}

        {/* ── Details section ── */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">Details</Typography>
            {!readonly && !editingDetails && (
              <Tooltip title="Edit details">
                <IconButton size="small" onClick={startEditingDetails}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {editingDetails ? (
            <Stack spacing={1.5}>
              <TextField
                label="Title"
                size="small"
                fullWidth
                value={detailFields.title ?? ''}
                onChange={(e) => setDetailFields((p) => ({ ...p, title: e.target.value }))}
              />
              <TextField
                label="Description"
                size="small"
                fullWidth
                multiline
                rows={3}
                value={detailFields.description ?? ''}
                onChange={(e) => setDetailFields((p) => ({ ...p, description: e.target.value }))}
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  label="Category"
                  size="small"
                  sx={{ flex: 1 }}
                  value={detailFields.category ?? ''}
                  onChange={(e) => setDetailFields((p) => ({ ...p, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Priority"
                  size="small"
                  sx={{ flex: 1 }}
                  value={detailFields.priority ?? ''}
                  onChange={(e) => setDetailFields((p) => ({ ...p, priority: e.target.value }))}
                >
                  {PRIORITIES.map((p) => (
                    <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleDetailsSave}
                  disabled={saving}
                >
                  Save
                </Button>
                <Button size="small" onClick={() => setEditingDetails(false)}>Cancel</Button>
              </Stack>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {request.description || <em style={{ color: '#999' }}>No description provided.</em>}
            </Typography>
          )}
        </Box>

        {/* ── Submitted by / date ── */}
        <Stack direction="row" spacing={3} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Submitted</Typography>
            <Typography variant="body2">{request.created_at?.slice(0, 10)}</Typography>
          </Box>
          {request.resolved_at && (
            <Box>
              <Typography variant="caption" color="text.secondary">Resolved</Typography>
              <Typography variant="body2">{request.resolved_at.slice(0, 10)}</Typography>
            </Box>
          )}
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {/* ── Photos & Files ── */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Photos & Files {attachments.length > 0 && `(${attachments.length})`}
          </Typography>
          <Stack direction="row" spacing={1}>
            {/* Camera capture — triggers native camera on mobile */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.txt"
              capture="environment"
              hidden
              onChange={handleFileInput}
            />
            <Tooltip title="Take photo / upload image">
              <span>
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <CircularProgress size={16} /> : <AddPhotoAlternateIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Attach file">
              <span>
                <IconButton
                  size="small"
                  onClick={() => {
                    fileInputRef.current.removeAttribute('capture')
                    fileInputRef.current?.click()
                    // Re-add after click so next time camera is triggered
                    setTimeout(() => fileInputRef.current?.setAttribute('capture', 'environment'), 500)
                  }}
                  disabled={uploading}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        {loadingAttachments ? (
          <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : attachments.length > 0 ? (
          <Stack spacing={0.75} sx={{ mb: 2 }}>
            {attachments.map((att) => (
              <Stack
                key={att.id}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 1.5, py: 1, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
              >
                <AttachmentIcon fileType={att.file_type} />
                <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                  {att.file_name}
                </Typography>
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    onClick={() => downloadAttachment({ requestId: request.id, attachmentId: att.id, fileName: att.file_name })}
                    disabled={downloading}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {!readonly && (
                  <Tooltip title="Remove">
                    <IconButton size="small" color="error" onClick={() => removeAttachment(att.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No photos or files yet.
          </Typography>
        )}
      </Box>
    </Drawer>
  )
}
