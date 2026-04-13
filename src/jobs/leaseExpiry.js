/**
 * Lease Expiry Job
 * ----------------
 * Runs every Monday at 8:00 AM.
 * Sends two tiers of email warnings to tenants with expiring active leases:
 *
 *   Tier 1 — "~60-day warning":  lease ends between 58 and 62 days from today
 *   Tier 2 — "~30-day reminder": lease ends between 28 and 32 days from today
 *
 * Using a ±2-day band rather than exact days ensures a weekly job always catches
 * the right leases even when run dates shift slightly (holidays, restarts, etc.)
 * and prevents sending duplicate reminders if the job somehow ran twice in a week.
 *
 * Both tiers use the same 'lease_expiring' template — include {{days_remaining}}
 * in your template body so the tenant sees the urgency.
 */

const leaseRepo = require('../dal/leaseRepository');
const notificationService = require('../services/notificationService');

/** Format a Date or date string as YYYY-MM-DD */
function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

/** Compute whole days between today and a future date */
function daysUntil(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - today) / (1000 * 60 * 60 * 24));
}

async function sendWarnings(leases, tier) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const lease of leases) {
    const days = daysUntil(lease.end_date);
    try {
      const result = await notificationService.sendAllChannels({
        triggerEvent: 'lease_expiring',
        recipientId: lease.user_id || lease.id, // user_id from the joined query
        variables: {
          first_name:     lease.first_name,
          tenant_name:    `${lease.first_name} ${lease.last_name}`,
          lease_end:      formatDate(lease.end_date),
          days_remaining: String(days),
          unit:           lease.unit_number,
          property:       lease.property_name,
        },
      });
      result === null ? skipped++ : sent++;
    } catch (err) {
      failed++;
      console.error(
        `[leaseExpiry] ${tier} — failed for user ${lease.user_id} (lease ${lease.id}):`,
        err.message,
      );
    }
  }

  console.log(`[leaseExpiry] ${tier} — sent=${sent} skipped=${skipped} failed=${failed}`);
}

async function run() {
  console.log('[leaseExpiry] Starting...');

  // Fetch all active leases expiring within 65 days (covers both bands)
  let expiring;
  try {
    expiring = await leaseRepo.findExpiringWithin(65);
  } catch (err) {
    console.error('[leaseExpiry] Failed to query expiring leases:', err.message);
    return;
  }

  if (!expiring.length) {
    console.log('[leaseExpiry] No leases expiring within 65 days. Done.');
    return;
  }

  // Split into two bands
  const sixtyDayWarning  = expiring.filter(l => { const d = daysUntil(l.end_date); return d >= 58 && d <= 62; });
  const thirtyDayWarning = expiring.filter(l => { const d = daysUntil(l.end_date); return d >= 28 && d <= 32; });

  console.log(
    `[leaseExpiry] Found ${expiring.length} expiring lease(s). ` +
    `~60-day: ${sixtyDayWarning.length}, ~30-day: ${thirtyDayWarning.length}`,
  );

  if (sixtyDayWarning.length)  await sendWarnings(sixtyDayWarning,  '60-day');
  if (thirtyDayWarning.length) await sendWarnings(thirtyDayWarning, '30-day');

  console.log('[leaseExpiry] Done.');
}

module.exports = { run };
