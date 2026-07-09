/**
 * Payment Reconciliation Script
 * ─────────────────────────────
 * Finds all rent_payments stuck in 'pending' status, checks their real state
 * on Stripe, and syncs the DB accordingly.
 *
 * Safe to run multiple times — idempotent.
 * Does NOT send receipt emails (this is a backfill, not a live event).
 *
 * Usage:
 *   railway run node scripts/reconcile-payments.js            # dry run (preview only)
 *   railway run node scripts/reconcile-payments.js --commit   # apply changes
 */

require('dotenv').config();
const Stripe = require('stripe');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const DRY_RUN = !process.argv.includes('--commit');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// DATABASE_PUBLIC_URL is Railway's externally-accessible connection string.
// DATABASE_URL uses the internal hostname (postgres.railway.internal) which
// is only reachable from inside Railway's network, not via `railway run` locally.
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[reconcile] ERROR: Neither DATABASE_PUBLIC_URL nor DATABASE_URL is set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log(`\n[reconcile] Mode: ${DRY_RUN ? 'DRY RUN (pass --commit to apply)' : 'COMMIT'}\n`);

  const { rows: pendingPayments } = await pool.query(`
    SELECT rp.*, l.id AS lease_id_check
    FROM rent_payments rp
    JOIN leases l ON l.id = rp.lease_id
    WHERE rp.status = 'pending'
      AND rp.stripe_payment_intent_id IS NOT NULL
    ORDER BY rp.created_at ASC
  `);

  if (pendingPayments.length === 0) {
    console.log('[reconcile] No pending Stripe payments found. Nothing to do.');
    await pool.end();
    return;
  }

  console.log(`[reconcile] Found ${pendingPayments.length} pending payment(s) to check.\n`);

  const results = { completed: 0, failed: 0, stillPending: 0, errors: 0 };

  for (const payment of pendingPayments) {
    const intentId = payment.stripe_payment_intent_id;

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(intentId);
    } catch (err) {
      console.error(`  [ERROR] Could not fetch intent ${intentId}: ${err.message}`);
      results.errors++;
      continue;
    }

    const amountPaid = parseFloat(payment.amount_paid);

    console.log(`  Payment ${payment.id}`);
    console.log(`    Intent:  ${intentId}`);
    console.log(`    Stripe:  ${intent.status}`);
    console.log(`    Amount:  $${amountPaid.toFixed(2)}`);
    console.log(`    Action:  `, end => end);

    if (intent.status === 'succeeded') {
      console.log('→ mark completed + append ledger entry');
      results.completed++;

      if (!DRY_RUN) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(
            `UPDATE rent_payments SET status = 'completed' WHERE id = $1`,
            [payment.id],
          );

          // Get current ledger balance for this lease
          const { rows: balanceRows } = await client.query(
            `SELECT balance_after FROM ledger_entries WHERE lease_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [payment.lease_id],
          );
          const currentBalance = balanceRows[0] ? parseFloat(balanceRows[0].balance_after) : 0;
          const balanceAfter = parseFloat((currentBalance - amountPaid).toFixed(2));

          await client.query(
            `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
             VALUES ($1, $2, 'payment', $3, $4, $5, $6, NULL)`,
            [
              uuidv4(),
              payment.lease_id,
              -amountPaid,
              balanceAfter,
              `Reconciled Stripe ACH payment — ${intentId}`,
              payment.id,
            ],
          );

          await client.query('COMMIT');
          console.log(`    ✓ Done`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`    ✗ DB error: ${err.message}`);
          results.errors++;
          results.completed--;
        } finally {
          client.release();
        }
      }
    } else if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
      console.log('→ mark failed');
      results.failed++;

      if (!DRY_RUN) {
        try {
          await pool.query(
            `UPDATE rent_payments SET status = 'failed' WHERE id = $1`,
            [payment.id],
          );
          console.log(`    ✓ Done`);
        } catch (err) {
          console.error(`    ✗ DB error: ${err.message}`);
          results.errors++;
          results.failed--;
        }
      }
    } else {
      // processing, requires_action, requires_confirmation — genuinely still in flight
      console.log(`→ leave as pending (Stripe status: ${intent.status})`);
      results.stillPending++;
    }

    console.log('');
  }

  console.log('─────────────────────────────────');
  console.log(`[reconcile] Summary:`);
  console.log(`  Marked completed:  ${results.completed}`);
  console.log(`  Marked failed:     ${results.failed}`);
  console.log(`  Still pending:     ${results.stillPending}`);
  console.log(`  Errors:            ${results.errors}`);
  if (DRY_RUN) {
    console.log('\n  ⚠ DRY RUN — no changes were written. Re-run with --commit to apply.');
  }
  console.log('');

  await pool.end();
}

run().catch((err) => {
  console.error('[reconcile] Fatal error:', err.message);
  process.exit(1);
});
