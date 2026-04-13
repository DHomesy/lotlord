/**
 * Rent Reminder Job
 * -----------------
 * Runs daily at 8:00 AM.
 * Finds all active-lease rent charges due tomorrow with no completed payment,
 * and sends a reminder email to each tenant using the 'rent_due' template.
 *
 * If no 'rent_due' email template exists in the DB the send is skipped —
 * the job won't fail, it will just log a warning. Create the template via
 * POST /api/v1/notifications/templates first.
 */

const ledgerRepo = require('../dal/ledgerRepository');
const notificationService = require('../services/notificationService');

async function run() {
  console.log('[rentReminder] Starting...');

  let charges;
  try {
    charges = await ledgerRepo.findChargesDueTomorrow();
  } catch (err) {
    console.error('[rentReminder] Failed to query due charges:', err.message);
    return;
  }

  if (!charges.length) {
    console.log('[rentReminder] No rent charges due tomorrow. Done.');
    return;
  }

  console.log(`[rentReminder] ${charges.length} charge(s) due tomorrow. Sending reminders...`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const charge of charges) {
    try {
      const result = await notificationService.sendAllChannels({
        triggerEvent: 'rent_due',
        recipientId: charge.user_id,
        variables: {
          first_name:   charge.first_name,
          tenant_name:  `${charge.first_name} ${charge.last_name}`,
          due_date:     charge.due_date instanceof Date
                          ? charge.due_date.toISOString().split('T')[0]
                          : String(charge.due_date),
          amount:       `$${parseFloat(charge.amount).toFixed(2)}`,
          unit:         charge.unit_number,
          property:     charge.property_name,
        },
      });

      if (result === null) {
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      failed++;
      console.error(
        `[rentReminder] Failed to send reminder to user ${charge.user_id} (lease ${charge.lease_id}):`,
        err.message,
      );
    }
  }

  console.log(
    `[rentReminder] Done. sent=${sent} skipped=${skipped} failed=${failed}`,
  );
}

module.exports = { run };
