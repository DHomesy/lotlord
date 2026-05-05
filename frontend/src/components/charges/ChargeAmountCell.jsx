import { Box, Typography } from '@mui/material'

/**
 * ChargeAmountCell
 *
 * Compact DataGrid cell. Top line: full charge amount. Bottom line: balance
 * due (amount minus any partial payments). Balance is painted red when the
 * due date has passed and the charge is still open.
 *
 * Props:
 *   amount    {number|string}  Total charge amount in dollars
 *   totalPaid {number|string}  Amount collected so far
 *   status    {string}         unpaid | partial | pending | paid | voided
 *   dueDate   {string}         ISO date string YYYY-MM-DD
 */
export default function ChargeAmountCell({ amount, totalPaid, status, dueDate }) {
  const full      = Number(amount ?? 0)
  const paid      = Number(totalPaid ?? 0)
  const remaining = Math.max(0, full - paid)

  const today     = new Date().toISOString().slice(0, 10)
  const isPastDue = !!dueDate
    && dueDate.slice(0, 10) < today
    && status !== 'paid'
    && status !== 'voided'

  // Balance to show for open / in-progress charges
  const balance = (status === 'partial' || status === 'pending') ? remaining : full

  const balanceColor = isPastDue
    ? 'error.main'
    : status === 'pending' ? 'info.main' : 'warning.main'

  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="body2" fontWeight={600} lineHeight={1.3}>
        ${full.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </Typography>

      {(status === 'unpaid' || status === 'partial' || status === 'pending') && (
        <Typography variant="caption" color={balanceColor}>
          Balance: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Typography>
      )}
      {status === 'paid' && (
        <Typography variant="caption" color="success.main">Paid in full</Typography>
      )}
      {status === 'voided' && (
        <Typography variant="caption" color="text.disabled">Voided</Typography>
      )}
    </Box>
  )
}
