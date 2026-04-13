const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findByLeaseId(leaseId, { page = 1, limit = 20 } = {}) {
  const { limit: l, offset } = parsePagination(page, limit);
  const { rows } = await query(
    `SELECT * FROM rent_payments WHERE lease_id = $1 ORDER BY payment_date DESC LIMIT $2 OFFSET $3`,
    [leaseId, l, offset],
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM rent_payments WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function create(client, { id, leaseId, chargeId, amountPaid, paymentDate, paymentMethod, stripePaymentIntentId, status, notes }) {
  const { rows } = await client.query(
    `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date,
                                payment_method, stripe_payment_intent_id, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, leaseId, chargeId || null, amountPaid, paymentDate,
     paymentMethod, stripePaymentIntentId || null, status || 'completed', notes || null],
  );
  return rows[0];
}

async function updateStatus(id, status, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const { rows } = await fn(
    `UPDATE rent_payments SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id],
  );
  return rows[0] || null;
}

async function findByStripePaymentIntentId(stripePaymentIntentId) {
  const { rows } = await query(
    'SELECT * FROM rent_payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [stripePaymentIntentId],
  );
  return rows[0] || null;
}

/**
 * Return any in-flight (pending) payment for a specific charge.
 * Used to block duplicate payment submissions.
 */
async function findPendingByChargeId(chargeId) {
  const { rows } = await query(
    `SELECT * FROM rent_payments WHERE charge_id = $1 AND status = 'pending' LIMIT 1`,
    [chargeId],
  );
  return rows[0] || null;
}

/**
 * Return any completed payment for a specific charge.
 * Used to block re-paying an already-settled charge.
 */
async function findCompletedByChargeId(chargeId) {
  const { rows } = await query(
    `SELECT * FROM rent_payments WHERE charge_id = $1 AND status = 'completed' LIMIT 1`,
    [chargeId],
  );
  return rows[0] || null;
}

module.exports = { findByLeaseId, findById, create, updateStatus, findByStripePaymentIntentId, findPendingByChargeId, findCompletedByChargeId };
