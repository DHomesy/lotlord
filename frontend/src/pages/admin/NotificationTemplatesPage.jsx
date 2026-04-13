import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
  Alert, Table, TableBody, TableCell, TableRow, TableHead,
} from '@mui/material'
import AddIcon    from '@mui/icons-material/Add'
import EditIcon   from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PageContainer   from '../../components/layout/PageContainer'
import DataTable       from '../../components/common/DataTable'
import ConfirmDialog   from '../../components/common/ConfirmDialog'
import LoadingOverlay  from '../../components/common/LoadingOverlay'
import {
  useNotificationTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '../../hooks/useNotifications'

// ─── Constants ────────────────────────────────────────────────────────────────
const TRIGGER_EVENTS = [
  { value: 'rent_due',           label: 'Rent Due' },
  { value: 'rent_overdue',       label: 'Rent Overdue' },
  { value: 'late_fee_applied',   label: 'Late Fee Applied' },
  { value: 'lease_expiring',     label: 'Lease Expiring' },
  { value: 'maintenance_update', label: 'Maintenance Update' },
  { value: 'payment_received',   label: 'Payment Received' },
  { value: 'custom',             label: 'Custom / Manual' },
]
const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms',   label: 'SMS' },
]
const VARIABLES_INFO = [
  { variable: '{{tenant_name}}',   description: 'Full name of the tenant, e.g. "John Smith"' },
  { variable: '{{first_name}}',    description: 'First name only, e.g. "John"' },
  { variable: '{{amount}}',        description: 'Dollar amount, e.g. "$1,200.00"' },
  { variable: '{{due_date}}',      description: 'Due or relevant date, e.g. "Mar 15, 2026"' },
  { variable: '{{unit}}',          description: 'Unit number / identifier, e.g. "4B"' },
  { variable: '{{property}}',      description: 'Property name' },
  { variable: '{{landlord_name}}', description: 'Admin / landlord full name' },
  { variable: '{{lease_start}}',   description: 'Lease start date' },
  { variable: '{{lease_end}}',     description: 'Lease end date' },
  { variable: '{{status}}',        description: 'Status string, e.g. "overdue"' },
  { variable: '{{description}}',   description: 'Free-form description text' },
]

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  name:         z.string().min(1, 'Name is required'),
  channel:      z.enum(['email', 'sms']),
  triggerEvent: z.enum(['rent_due', 'rent_overdue', 'late_fee_applied', 'lease_expiring', 'maintenance_update', 'payment_received', 'custom']),
  subject:      z.string().optional(),
  bodyTemplate: z.string().min(1, 'Body is required'),
})

// ─── Template dialog ──────────────────────────────────────────────────────────
function TemplateDialog({ open, onClose, template }) {
  const isEditing = !!template
  const create    = useCreateTemplate()
  const update    = useUpdateTemplate(template?.id)
  const { mutate, isPending, error, reset } = isEditing ? update : create

  const { register, handleSubmit, watch, setValue, control, formState: { errors }, reset: resetForm } = useForm({
    resolver: zodResolver(schema),
    defaultValues: template
      ? {
          name:         template.name,
          channel:      template.channel,
          triggerEvent: template.trigger_event,
          subject:      template.subject || '',
          bodyTemplate: template.body_template,
        }
      : { channel: 'email', triggerEvent: 'custom' },
  })

  const channel = watch('channel')

  const onSubmit = (values) => {
    mutate(values, {
      onSuccess: () => { onClose(); resetForm() },
    })
  }

  const insertVariable = (v) => {
    const el = document.querySelector('[name="bodyTemplate"]')
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end   = el.selectionEnd ?? el.value.length
    const cur   = el.value
    setValue('bodyTemplate', cur.slice(0, start) + v + cur.slice(end))
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length) }, 0)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Template' : 'New Template'}</DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="template-form" onSubmit={handleSubmit(onSubmit)} spacing={2} mt={0.5}>
          {error && (
            <Alert severity="error">
              {error?.response?.data?.error || error?.message || 'Save failed.'}
            </Alert>
          )}

          <TextField
            label="Template name"
            fullWidth
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Controller
              name="channel"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  label="Channel"
                  fullWidth
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={!!errors.channel}
                >
                  {CHANNELS.map((c) => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Controller
              name="triggerEvent"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  label="Trigger event"
                  fullWidth
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={!!errors.triggerEvent}
                >
                  {TRIGGER_EVENTS.map((e) => (
                    <MenuItem key={e.value} value={e.value}>{e.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>

          {channel === 'email' && (
            <TextField
              label="Subject"
              fullWidth
              {...register('subject')}
              error={!!errors.subject}
              helperText="Supports {{variables}}"
            />
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
              Available variables — click to insert at cursor:
            </Typography>
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
                mb: 1,
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>Variable</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>What it inserts</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {VARIABLES_INFO.map(({ variable, description }) => (
                    <TableRow
                      key={variable}
                      hover
                      onClick={() => insertVariable(variable)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography
                          component="code"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            bgcolor: 'action.selected',
                            px: 0.6,
                            py: 0.2,
                            borderRadius: 0.5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {variable}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5, fontSize: 12, color: 'text.secondary' }}>
                        {description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <TextField
              label="Body"
              fullWidth
              multiline
              rows={6}
              {...register('bodyTemplate')}
              error={!!errors.bodyTemplate}
              helperText={errors.bodyTemplate?.message || 'Use {{variable_name}} placeholders'}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { onClose(); resetForm(); reset() }}>Cancel</Button>
        <Button form="template-form" type="submit" variant="contained" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save template'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function NotificationTemplatesPage() {
  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [deleting,    setDeleting]    = useState(null)

  const { data: templates = [], isLoading } = useNotificationTemplates()
  const { mutate: del, isPending: isDeleting } = useDeleteTemplate()

  if (isLoading) return <LoadingOverlay />

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit   = (t) => { setEditing(t);   setDialogOpen(true) }

  const columns = [
    { field: 'name',          headerName: 'Name',          flex: 1.5 },
    {
      field: 'channel',
      headerName: 'Channel',
      width: 90,
      renderCell: ({ value }) => (
        <Chip label={value} size="small" color={value === 'email' ? 'primary' : 'secondary'} variant="outlined" />
      ),
    },
    {
      field: 'trigger_event',
      headerName: 'Trigger',
      flex: 1,
      valueFormatter: (v) => TRIGGER_EVENTS.find((e) => e.value === v)?.label ?? v,
    },
    { field: 'subject',       headerName: 'Subject',       flex: 1.5 },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row">
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  return (
    <PageContainer
      title="Notification Templates"
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New template
        </Button>
      }
    >
      <DataTable rows={templates} columns={columns} getRowId={(r) => r.id} />

      <TemplateDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        template={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete template"
        description={`Delete "${deleting?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        loading={isDeleting}
        onConfirm={() => del(deleting.id, { onSuccess: () => setDeleting(null) })}
        onCancel={() => setDeleting(null)}
      />
    </PageContainer>
  )
}
