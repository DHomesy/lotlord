/**
 * Late Fee Job
 * ------------
 * Runs daily at 9:00 AM.
 * Finds all active-lease rent charges that are:
 *   - past their due_date + grace period
 *   - have no completed payment
 *   - have NOT already had a late fee applied for the same billing period
 *
 * For each, it:
 *   1. Applies the late fee to the ledger via ledgerService.applyLateFee()
 *   2. Sends a 'late_fee_applied' notification email to the tenant
 *
 * The duplicate-prevention logic lives in the SQL query (findOverdueUnpaidCharges),
 * so even if the job somehow runs twice in a day, late fees won't be double-applied.
 */

const ledgerRepo = require('../dal/ledgerRepository');
const ledgerService = require('../services/ledgerService');
const notificationService = require('../services/notificationService');

// System user sentinel — late fees applied by the job have no createdBy user.
// You can create a dedicated system user in the DB and use that UUID instead.
const SYSTEM_USER = null;

async function run() {
  console.log('[lateFee] Starting...');

  let overdueCharges;
  try {
    overdueCharges = await ledgerRepo.findOverdueUnpaidCharges();
  } catch (err) {
    console.error('[lateFee] Failed to query overdue charges:', err.message);
    return;
  }

  if (!overdueCharges.length) {
    console.log('[lateFee] No overdue unpaid charges found. Done.');
    return;
  }

  console.log(`[lateFee] ${overdueCharges.length} overdue charge(s) found. Applying late fees...`);

  let applied = 0;
  let failed = 0;

  // NOTE (S1): Charges are processed serially (one DB round-trip per charge) rather
  // than in parallel. This is intentional — serial processing keeps database connection
  // usage predictable and avoids flooding the pool when hundreds of charges are due.
  // If throughput becomes a bottleneck, consider batching the charge inserts into a
  // single INSERT … SELECT statement and sending notifications via Promise.allSettled.
  for (const charge of overdueCharges) {
    try {
      // Apply the late fee to the ledger (atomic — writes charge + ledger entry)
      const result = await ledgerService.applyLateFee({
        leaseId: charge.lease_id,
        createdBy: SYSTEM_USER,
      });

      if (!result) {
        // applyLateFee returns null when late_fee_amount is 0 — shouldn't reach here
        // since the query already filters late_fee_amount > 0, but guard anyway
        console.warn(`[lateFee] Lease ${charge.lease_id} has no late fee configured, skipping.`);
        continue;
      }

      applied++;
      console.log(
        `[lateFee] Applied $${result.fee} late fee to lease ${charge.lease_id} (overdue since ${charge.due_date})`,
      );

      // Send notification — non-fatal if it fails
      try {
        await notificationService.sendAllChannels({
          triggerEvent: 'late_fee_applied',
          recipientId: charge.user_id,
          variables: {
            first_name:   charge.first_name,
            tenant_name:  `${charge.first_name} ${charge.last_name}`,
            amount:       `$${parseFloat(result.fee).toFixed(2)}`,
            due_date:     charge.due_date instanceof Date
                            ? charge.due_date.toISOString().split('T')[0]
                            : String(charge.due_date),
            unit:         charge.unit_number,
            property:     charge.property_name,
          },
        });
      } catch (notifErr) {
        console.error(
          `[lateFee] Late fee applied but notification failed for user ${charge.user_id}:`,
          notifErr.message,
        );
      }
    } catch (err) {
      failed++;
      console.error(
        `[lateFee] Failed to apply late fee for lease ${charge.lease_id}:`,
        err.message,
      );
    }
  }

  console.log(`[lateFee] Done. applied=${applied} failed=${failed}`);
}

module.exports = { run };
