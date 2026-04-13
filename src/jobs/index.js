/**
 * Scheduled background jobs — powered by node-cron.
 * All jobs run inside the API server process (no separate worker needed at MVP scale).
 * Call jobs.init() once at server startup from src/index.js.
 *
 * Cron syntax: second(optional) minute hour day month weekday
 */

const cron = require('node-cron');
const rentReminderJob = require('./rentReminder');
const lateFeeJob      = require('./lateFee');
const leaseExpiryJob  = require('./leaseExpiry');

function init() {
  // Daily at 8:00 AM — send rent due reminders for charges due tomorrow
  cron.schedule('0 8 * * *', () => {
    console.log('[job] rentReminder — running');
    rentReminderJob.run().catch(err =>
      console.error('[job] rentReminder — unhandled error:', err.message),
    );
  });

  // Daily at 9:00 AM — apply late fees on overdue balances past grace period
  cron.schedule('0 9 * * *', () => {
    console.log('[job] lateFee — running');
    lateFeeJob.run().catch(err =>
      console.error('[job] lateFee — unhandled error:', err.message),
    );
  });

  // Every Monday at 8:00 AM — warn tenants whose lease expires within 60/30 days
  cron.schedule('0 8 * * 1', () => {
    console.log('[job] leaseExpiry — running');
    leaseExpiryJob.run().catch(err =>
      console.error('[job] leaseExpiry — unhandled error:', err.message),
    );
  });

  console.log('[jobs] Scheduled jobs initialised');
}

module.exports = { init };
