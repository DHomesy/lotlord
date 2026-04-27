import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Stack, TextField, MenuItem, Divider, Typography,
  Checkbox, FormControlLabel, Alert, Paper, Box,
  Chip, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import CloseIcon    from '@mui/icons-material/Close'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import OpenInNewIcon  from '@mui/icons-material/OpenInNew'
import DeleteIcon     from '@mui/icons-material/Delete'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import PageContainer from '../../components/layout/PageContainer'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import TenantPicker from '../../components/pickers/TenantPicker'
import { useLease, useUpdateLease, useCoTenants, useAddCoTenant, useRemoveCoTenant } from '../../hooks/useLeases'
import { useCreateCharge, useCharges, useVoidCharge } from '../../hooks/useCharges'
import { useDocuments, useUploadDocument, useDownloadDocument, useDeleteDocument } from '../../hooks/useDocuments'

const STATUSES = ['active', 'pending', 'expired', 'terminated']

function toDateInput(val) {
  if (!val) return ''
  return String(val).slice(0, 10)
}

function toDisplayDate(val) {
  const d = toDateInput(val)
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/**
 * Returns an array of YYYY-MM-01 strings covering every month in [startDate, endDate].
 * Generates one charge per month, due on the 1st.
 */
function getMonthlyDueDates(startDate, endDate) {
  if (!startDate || !endDate) return []
  const dates = []
  const cur = new Date(toDateInput(startDate))
  cur.setDate(1) // normalise to 1st of month
  const end = new Date(toDateInput(endDate))
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    dates.push(`${y}-${m}-01`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return dates
}

export default function EditLeasePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: lease, isLoading } = useLease(id)
  const { mutate: update, isPending: updating } = useUpdateLease(id)
  const { mutateAsync: createCharge } = useCreateCharge()
  const { mutateAsync: voidCharge }   = useVoidCharge()
  const { data: rawExistingCharges } = useCharges({ leaseId: id })
  const { data: coTenants = [] } = useCoTenants(id)
  const { mutate: addCoTenant, isPending: addingCoTenant } = useAddCoTenant(id)
  const { mutate: removeCoTenant } = useRemoveCoTenant(id)

  const { data: documentsRaw } = useDocuments({ relatedId: id })
  const { mutate: uploadDocument, isPending: uploading } = useUploadDocument()
  const { mutate: downloadDocument } = useDownloadDocument()
  const { mutate: deleteDocument } = useDeleteDocument()
  const fileInputRef = useRef(null)
  const documents = Array.isArray(documentsRaw) ? documentsRaw : (documentsRaw?.documents ?? [])
  const leaseDoc = documents.find((d) => d.category === 'lease' || d.category === 'lease_agreement') ?? null
  const [docMsg, setDocMsg] = useState(null)   // { type, text }

  const [pendingCoTenant, setPendingCoTenant] = useState(null)

  // Editable form state — initialised lazily from lease once it arrives
  const [init,    setInit]    = useState(false)
  const [endDate, setEndDate] = useState('')
  const [rent,    setRent]    = useState('')
  const [deposit, setDeposit] = useState('')
  const [status,  setStatus]  = useState('active')

  // UX controls
  const [confirmed,         setConfirmed]         = useState(false)
  const [addCharges,        setAddCharges]         = useState(false)
  const [chargeMsg,         setChargeMsg]          = useState(null)   // { type: 'success'|'warning', text }
  const [submitting,        setSubmitting]         = useState(false)
  const [terminateDialog,   setTerminateDialog]    = useState(false)  // show unpaid charge void prompt

  // Initialise inputs from loaded lease (runs once)
  if (lease && !init) {
    setEndDate(toDateInput(lease.end_date))
    setRent(String(lease.monthly_rent ?? ''))
    setDeposit(String(lease.deposit_amount ?? ''))
    setStatus(lease.status ?? 'active')
    setInit(true)
  }

  if (isLoading || !init) return <LoadingOverlay />

  const tenantName = [lease.first_name, lease.last_name].filter(Boolean).join(' ') || '—'
  const unitLabel  = [
    lease.property_name,
    lease.unit_number ? `Unit ${lease.unit_number}` : null,
  ].filter(Boolean).join(' — ') || '—'

  const backPath = `/tenants/${lease.tenant_id}`

  const previewChargeCount = addCharges
    ? getMonthlyDueDates(lease.start_date, endDate || toDateInput(lease.end_date)).length
    : 0

  // Months that already have a rent charge for this lease (YYYY-MM format)
  const existingRentMonths = new Set(
    (Array.isArray(rawExistingCharges) ? rawExistingCharges : [])
      .filter((c) => c.charge_type === 'rent')
      .map((c) => String(c.due_date).slice(0, 7))
  )

  const newChargeCount = addCharges
    ? getMonthlyDueDates(lease.start_date, endDate || toDateInput(lease.end_date))
        .filter((d) => !existingRentMonths.has(d.slice(0, 7))).length
    : 0

  // Unpaid charges for this lease (used by termination dialog)
  const unpaidCharges = (Array.isArray(rawExistingCharges) ? rawExistingCharges : [])
    .filter((c) => !c.paid && !c.voided)

  const unpaidTotal = unpaidCharges.reduce((sum, c) => sum + parseFloat(c.amount ?? 0), 0)

  const doSave = (payload) => {
    update(payload, {
      onSuccess: async () => {
        if (addCharges) {
          const allDueDates = getMonthlyDueDates(lease.start_date, endDate || toDateInput(lease.end_date))
          const dueDates = allDueDates.filter((d) => !existingRentMonths.has(d.slice(0, 7)))
          const skipped = allDueDates.length - dueDates.length
          if (dueDates.length === 0) {
            setChargeMsg({ type: 'info', text: `Lease updated. All ${skipped} monthly charge(s) for this period already exist — no duplicates created.` })
            setSubmitting(false)
            return
          }
          try {
            await Promise.all(
              dueDates.map((dueDate) =>
                createCharge({
                  unitId:     lease.unit_id,
                  leaseId:    lease.id,
                  chargeType: 'rent',
                  amount:     parseFloat(rent) || lease.monthly_rent,
                  dueDate,
                })
              )
            )
            const skipMsg = skipped > 0 ? ` (${skipped} already existed and were skipped)` : ''
            setChargeMsg({ type: 'success', text: `Lease updated and ${dueDates.length} monthly charge(s) created.${skipMsg}` })
          } catch {
            setChargeMsg({ type: 'warning', text: 'Lease saved, but some charges could not be created. Check the Charges page.' })
          }
        } else {
          navigate('/leases')
        }
        setSubmitting(false)
      },
      onError: () => setSubmitting(false),
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!confirmed) return

    const payload = { status }
    if (endDate)                            payload.endDate       = endDate
    if (rent !== '')                        payload.monthlyRent   = parseFloat(rent)
    if (deposit !== '')                     payload.depositAmount = parseFloat(deposit)

    // Intercept termination to check for unpaid charges
    if (status === 'terminated' && unpaidCharges.length > 0) {
      setSubmitting(false)
      setTerminateDialog({ payload })
      return
    }

    setSubmitting(true)
    setChargeMsg(null)
    doSave(payload)
  }

  const handleTerminateVoid = async () => {
    setTerminateDialog(false)
    setSubmitting(true)
    setChargeMsg(null)
    try {
      await Promise.all(unpaidCharges.map((c) => voidCharge(c.id)))
    } catch {
      setChargeMsg({ type: 'warning', text: 'Could not void all charges. Proceeding with termination.' })
    }
    doSave(terminateDialog.payload)
  }

  const handleTerminateSkip = () => {
    const { payload } = terminateDialog
    setTerminateDialog(false)
    setSubmitting(true)
    setChargeMsg(null)
    doSave(payload)
  }

  return (
    <PageContainer
      title="Edit Lease"
      actions={
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backPath)}>
          Back to Tenant
        </Button>
      }
    >
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 }, maxWidth: 740, mx: 'auto' }}>
        <Stack component="form" onSubmit={handleSubmit} spacing={3}>

          {/* ── Read-only context ── */}
          <Typography variant="overline" color="text.secondary">Lease Details</Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Tenant"
              value={tenantName}
              disabled
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Unit"
              value={unitLabel}
              disabled
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="To move a tenant to a different unit, terminate this lease and create a new one"
            />
          </Stack>

          <TextField
            label="Start Date"
            value={toDisplayDate(lease.start_date)}
            disabled
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="Locked — charges and ledger entries are anchored to this date"
          />

          <Divider />

          {/* ── Editable fields ── */}
          <Typography variant="overline" color="text.secondary">Edit Fields</Typography>

          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setConfirmed(false) }}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Monthly Rent ($)"
              type="number"
              value={rent}
              onChange={(e) => { setRent(e.target.value); setConfirmed(false) }}
              inputProps={{ min: 0, step: '0.01' }}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="Security Deposit ($)"
              type="number"
              value={deposit}
              onChange={(e) => { setDeposit(e.target.value); setConfirmed(false) }}
              inputProps={{ min: 0, step: '0.01' }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <TextField
            label="Status"
            select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setConfirmed(false) }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </MenuItem>
            ))}
          </TextField>

          <Divider />

          {/* ── Auto-populate charges ── */}
          <Typography variant="overline" color="text.secondary">Charges</Typography>

          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addCharges}
                  onChange={(e) => setAddCharges(e.target.checked)}
                />
              }
              label="Auto-generate monthly rent charges for this lease period"
            />
            {addCharges && endDate && (
              <Alert severity="info" sx={{ mt: 1 }}>
                {newChargeCount > 0 ? (
                  <>
                    Will create <strong>{newChargeCount}</strong> new monthly rent charge(s) at{' '}
                    <strong>${parseFloat(rent || 0).toLocaleString()}/mo</strong>, due on the 1st of each
                    month from <strong>{toDisplayDate(lease.start_date)}</strong> to{' '}
                    <strong>{toDisplayDate(endDate)}</strong>.
                    {previewChargeCount - newChargeCount > 0 && (
                      <> <strong>{previewChargeCount - newChargeCount}</strong> month(s) already have charges and will be skipped.</>
                    )}
                  </>
                ) : (
                  <>All <strong>{previewChargeCount}</strong> monthly charge(s) for this period already exist — nothing will be created.</>
                )}
              </Alert>
            )}
          </Box>

          {chargeMsg && (
            <Alert
              severity={chargeMsg.type}
              action={
                chargeMsg.type === 'success'
                  ? <Button size="small" onClick={() => navigate(backPath)}>Done</Button>
                  : undefined
              }
            >
              {chargeMsg.text}
            </Alert>
          )}

          <Divider />

          {/* ── Co-Tenants ── */}
          <Typography variant="overline" color="text.secondary">Co-Tenants</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
            Additional tenants sharing this lease. Co-tenants can log in and view/pay charges.
            Maximum 5 co-tenants per lease.
          </Typography>

          {coTenants.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {coTenants.map((ct) => (
                <Chip
                  key={ct.tenant_id}
                  label={`${ct.first_name} ${ct.last_name}`}
                  size="small"
                  onDelete={() => removeCoTenant(ct.tenant_id)}
                  deleteIcon={
                    <Tooltip title="Remove co-tenant">
                      <CloseIcon fontSize="small" />
                    </Tooltip>
                  }
                />
              ))}
            </Stack>
          )}

          {coTenants.length < 5 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
              <Box sx={{ flex: 1 }}>
                <TenantPicker
                  value={pendingCoTenant}
                  onChange={setPendingCoTenant}
                  label="Add co-tenant"
                />
              </Box>
              <Button
                variant="outlined"
                startIcon={<PersonAddIcon />}
                disabled={!pendingCoTenant || addingCoTenant}
                onClick={() => {
                  addCoTenant(pendingCoTenant, { onSuccess: () => setPendingCoTenant(null) })
                }}
                sx={{ mt: { xs: 0, sm: '4px' }, whiteSpace: 'nowrap' }}
              >
                Add
              </Button>
            </Stack>
          )}

          <Divider />

          {/* ── Lease Document ── */}
          <Typography variant="overline" color="text.secondary">Lease Documents</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
            Attach a signed lease PDF and any addendums. Tenants can download all documents from their portal.
          </Typography>

          {docMsg && (
            <Alert severity={docMsg.type} onClose={() => setDocMsg(null)}>{docMsg.text}</Alert>
          )}

          {/* List of existing documents */}
          {documents.length > 0 && (
            <Stack spacing={1}>
              {documents.map((doc) => (
                <Stack
                  key={doc.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                  }}
                >
                  <InsertDriveFileIcon fontSize="small" color="action" />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {doc.file_name || 'Document'}
                  </Typography>
                  <Tooltip title="Download">
                    <Button
                      size="small"
                      startIcon={<OpenInNewIcon fontSize="small" />}
                      onClick={() => downloadDocument(doc.id)}
                    >
                      Download
                    </Button>
                  </Tooltip>
                  <Tooltip title="Delete document">
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon fontSize="small" />}
                      onClick={() => {
                        if (window.confirm('Remove this document? This cannot be undone.')) {
                          deleteDocument(doc.id, {
                            onSuccess: () => setDocMsg({ type: 'success', text: 'Document removed.' }),
                            onError:   () => setDocMsg({ type: 'error',   text: 'Failed to remove document.' }),
                          })
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          )}

          {/* Upload new document */}
          <Button
            variant="outlined"
            size="small"
            startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : documents.length > 0 ? 'Attach Addendum' : 'Attach Signed Lease'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const fd = new FormData()
              fd.append('file', file)
              fd.append('relatedType', 'lease')
              fd.append('relatedId', id)
              fd.append('category', 'lease')
              uploadDocument(fd, {
                onSuccess: () => setDocMsg({ type: 'success', text: 'Document uploaded successfully.' }),
                onError:   () => setDocMsg({ type: 'error',   text: 'Upload failed. Please try again.' }),
              })
              e.target.value = ''   // reset so same file can be re-selected
            }}
          />

          <Divider />

          {/* ── Confirm checkbox ── */}
          <FormControlLabel
            control={
              <Checkbox
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I have reviewed the changes above and confirm they are correct
              </Typography>
            }
          />

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => navigate(backPath)} disabled={submitting || updating}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!confirmed || submitting || updating}
            >
              {(submitting || updating) ? 'Saving…' : 'Save Changes'}
            </Button>
          </Stack>

        </Stack>
      </Paper>

      {/* ── Termination: unpaid charge dialog ── */}
      <Dialog open={!!terminateDialog} onClose={() => setTerminateDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Unpaid Charges</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This lease has <strong>{unpaidCharges.length} unpaid charge{unpaidCharges.length !== 1 ? 's' : ''}</strong> totalling{' '}
            <strong>${unpaidTotal.toFixed(2)}</strong>.
            Would you like to void them before terminating the lease?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminateDialog(false)}>Cancel</Button>
          <Button onClick={handleTerminateSkip} color="inherit">Keep Charges</Button>
          <Button onClick={handleTerminateVoid} color="error" variant="contained">Void & Terminate</Button>
        </DialogActions>
      </Dialog>

    </PageContainer>
  )
}
