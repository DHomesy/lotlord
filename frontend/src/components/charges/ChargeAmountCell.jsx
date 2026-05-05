import { Box, Typography } from '@mui/material'

/**
 * ChargeAmountCell
 *
 * Compact DataGrid cell. Top line: full charge amount. Second line: contextual
 * balance / in-transit indicator.
 *
 * Props:
 *   amount        {number|string}  Total charge amount in dollars
 *   totalPaid     {number|string}  Sum of COMPLETED payments
 *   pendingAmount {number|string}  Sum of in-flight (ACH pending) payments
 *   status        {string}         unpaid | partial | pending | paid | voided
 *   dueDate       {string}         ISO date string YYYY-MM-DD
 *
 * Status display logic:
 *   paid         → "Paid in full" (green)
 *   voided       → "Voided" (gray)
 *   pending      → full charge is in transit (no completed payments yet)
 *   partial      → some completed; show balance + any in-transit amount
 *   unpaid       → nothing collected yet; show balance
 */
export default function ChargeAmountCell({ amount, totalPaid, pendingAmount, status, dueDate }) {
  const full      = Number(amount ?? 0)
  const paid      = Number(totalPaid ?? 0)
  const inTransit = Number(pendingAmount ?? 0)
  // Remaining after completed payments
  const remaining = Math.max(0, full - paid)

  const today     = new Date().toISOString().slice(0, 10)
  const isPastDue = !!dueDate
    && dueDate.slice(0, 10) < today
    && status !== 'paid'
    && status !== 'voided'

  const balanceColor = isPastDue ? 'error.main' : 'warning.main'

  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="body2" fontWeight={600} lineHeight={1.3}>
        ${full.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </Typography>

      {/* Fully settled */}
      {status === 'paid' && (
        <Typography variant="caption" color="success.main">Paid in full</Typography>
      )}

      {/* Cancelled */}
      {status === 'voided' && (
        <Typography variant="caption" color="text.disabled">Voided</Typography>
      )}

      {/* Pure pending: full amount in transit, no completed payments yet */}
      {status === 'pending' && (
        <Typography variant="caption" color="info.main">
          ${inTransit > 0
            ? inTransit.toLocaleString('en-US', { minimumFractionDigits: 2 })
            : full.toLocaleString('en-US', { minimumFractionDigits: 2 })
          } in transit
        </Typography>
      )}

      {/* Open charges: show remaining balance + any in-transit note */}
      {(status === 'unpaid' || status === 'partial') && (
        <>
          <Typography variant="caption" color={inTransit > 0 ? 'text.secondary' : balanceColor} display="block">
            Balance: ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Typography>
          {inTransit > 0 && (
            <Typography variant="caption" color="info.main" display="block">
              ${inTransit.toLocaleString('en-US', { minimumFractionDigits: 2 })} in transit
            </Typography>
          )}
        </>
      )}
    </Box>
  )
}
