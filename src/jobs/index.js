/**
 * Scheduled background jobs — powered by node-cron.
 * All jobs run inside the API server process (no separate worker needed at MVP scale).
 * Call jobs.init() once at server startup from src/index.js.
 *
 * Cron syntax: second(optional) minute hour day month weekday
 */

const cron = require('node-cron');
const { pool } = require('../config/db');
const rentReminderJob = require('./rentReminder');
const lateFeeJob      = require('./lateFee');
const leaseExpiryJob  = require('./leaseExpiry');

// Unique advisory lock keys — must be stable integers, never reused across jobs.
const LOCK_KEYS = {
  rentReminder: 20260001,
  lateFee:      20260002,
  leaseExpiry:  20260003,
};

/**
 * Wraps a job's run() in a PostgreSQL session-level advisory lock so that
 * only one instance runs the job at a time when the app is horizontally scaled.
 * pg_try_advisory_lock is non-blocking: if another instance holds the lock the
 * job is simply skipped for that cycle rather than queued.
 */
async function withAdvisoryLock(lockKey, name, fn) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
    if (!rows[0].acquired) {
      console.log(`[job] ${name} — skipped (lock held by another instance)`);
      return;
    }
    console.log(`[job] ${name} — running`);
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    }
  } finally {
    client.release();
  }
}

function init() {
  // Daily at 8:00 AM — send rent due reminders for charges due tomorrow
  cron.schedule('0 8 * * *', () => {
    withAdvisoryLock(LOCK_KEYS.rentReminder, 'rentReminder', () => rentReminderJob.run())
      .catch(err => console.error('[job] rentReminder — unhandled error:', err.message));
  });

  // Daily at 9:00 AM — apply late fees on overdue balances past grace period
  cron.schedule('0 9 * * *', () => {
    withAdvisoryLock(LOCK_KEYS.lateFee, 'lateFee', () => lateFeeJob.run())
      .catch(err => console.error('[job] lateFee — unhandled error:', err.message));
  });

  // Every Monday at 8:00 AM — warn tenants whose lease expires within 60/30 days
  cron.schedule('0 8 * * 1', () => {
    withAdvisoryLock(LOCK_KEYS.leaseExpiry, 'leaseExpiry', () => leaseExpiryJob.run())
      .catch(err => console.error('[job] leaseExpiry — unhandled error:', err.message));
  });

  console.log('[jobs] Scheduled jobs initialised');
}

module.exports = { init };
