require('dotenv').config();
const app = require('./app');
const { PORT } = require('./config/env');
const { connectDb } = require('./config/db');
const jobs = require('./jobs');
const { sendAlert } = require('./middleware/errorAlerter');

const port = PORT || 3000;

// ── Process-level error listeners ────────────────────────────────────────────
// Catches async errors that escape Express (e.g. in cron jobs, event emitters)
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[server] Unhandled rejection:', err);
  sendAlert(err, { method: 'PROCESS', route: 'unhandledRejection' }).catch(() => {});
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  // Alert then exit — running after an uncaught exception is unsafe
  sendAlert(err, { method: 'PROCESS', route: 'uncaughtException' })
    .catch(() => {})
    .finally(() => process.exit(1));
});
// ─────────────────────────────────────────────────────────────────────────────

async function start() {
  await connectDb();
  jobs.init();

  // Warn if webhook secrets are absent in production — unauthenticated webhook calls
  // would be accepted, letting anyone forge Twilio SMS or SES email events.
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.warn('[server] WARNING: TWILIO_AUTH_TOKEN is not set — Twilio webhook signature validation is disabled in production');
    }
    if (!process.env.SES_WEBHOOK_SECRET) {
      console.warn('[server] WARNING: SES_WEBHOOK_SECRET is not set — SES inbound webhook is unauthenticated in production');
    }
  }

  app.listen(port, () => {
    console.log(`[server] Running on port ${port} (${process.env.NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
