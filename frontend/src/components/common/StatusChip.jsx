import { Chip } from '@mui/material'

const STATUS_CONFIG = {
  // Lease statuses
  active: { color: 'success', label: 'Active' },
  pending: { color: 'warning', label: 'Pending' },
  expired: { color: 'default', label: 'Expired' },
  terminated: { color: 'error', label: 'Terminated' },
  // Maintenance statuses
  open: { color: 'error', label: 'Open' },
  in_progress: { color: 'warning', label: 'In Progress' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'default', label: 'Cancelled' },
  resolved: { color: 'success', label: 'Resolved' },
  closed: { color: 'default', label: 'Closed' },
  // Payment / charge statuses
  paid: { color: 'success', label: 'Paid' },
  unpaid: { color: 'error', label: 'Unpaid' },
  partial: { color: 'warning', label: 'Partial' },
  voided: { color: 'default', label: 'Voided' },
  // Notification statuses
  sent: { color: 'success', label: 'Sent' },
  failed: { color: 'error', label: 'Failed' },
  received: { color: 'info', label: 'Received' },
  // Units
  vacant: { color: 'info', label: 'Vacant' },
  occupied: { color: 'success', label: 'Occupied' },
  maintenance: { color: 'warning', label: 'Maintenance' },
}

export default function StatusChip({ status }) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || { color: 'default', label: status }
  return <Chip label={config.label} color={config.color} size="small" />
}
