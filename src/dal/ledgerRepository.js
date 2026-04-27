const { query, getClient } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/** Append-only — NEVER update or delete entries from this table. */
async function appendEntry(client, { id, leaseId, entryType, amount, balanceAfter, description, referenceId, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, leaseId, entryType, amount, balanceAfter, description || null, referenceId || null, createdBy || null],
  );
  return rows[0];
}

/** Get the current outstanding balance for a lease (most recent balance_after). */
async function getCurrentBalance(leaseId) {
  const { rows } = await query(
    `SELECT balance_after FROM ledger_entries WHERE lease_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leaseId],
  );
  return rows[0] ? parseFloat(rows[0].balance_after) : 0;
}

/**
 * Amount actually due today: sum of non-voided charges with due_date <= TODAY
 * minus sum of completed payments. Excludes future-dated charges.
 *
 * Uses separate subqueries intentionally — a simple LEFT JOIN between
 * rent_charges and rent_payments would multiply rc.amount for charges with
 * multiple partial payments, producing an inflated result.
 */
async function getAmountDueNow(leaseId) {
  const { rows } = await query(
    `SELECT
       COALESCE((
         SELECT SUM(rc.amount)
           FROM rent_charges rc
          WHERE rc.lease_id = $1
            AND rc.voided_at IS NULL
            AND rc.due_date <= CURRENT_DATE
       ), 0)
       - COALESCE((
         SELECT SUM(rp.amount_paid)
           FROM rent_payments rp
           JOIN rent_charges rc ON rc.id = rp.charge_id
          WHERE rc.lease_id = $1
            AND rp.status = 'completed'
       ), 0)
     AS amount_due`,
    [leaseId],
  );
  return rows[0] ? parseFloat(rows[0].amount_due) : 0;
}

/** Return the full ledger history for a lease, oldest first.
 * effective_date is the business-meaningful date:
 *   charge  → due_date from the linked rent_charge
 *   payment → payment_date from the linked rent_payment
 *   credit / adjustment → falls back to created_at
 */
async function findByLeaseId(leaseId) {
  const { rows } = await query(
    `SELECT le.*,
            COALESCE(
              CASE
                WHEN le.entry_type = 'charge'  THEN rc.due_date::TEXT
                WHEN le.entry_type = 'payment' THEN rp.payment_date::TEXT
              END,
              le.created_at::DATE::TEXT
            ) AS effective_date,
            u.first_name || ' ' || u.last_name AS created_by_name
     FROM ledger_entries le
     LEFT JOIN users u         ON u.id  = le.created_by
     LEFT JOIN rent_charges rc ON rc.id = le.reference_id AND le.entry_type = 'charge'
     LEFT JOIN rent_payments rp ON rp.id = le.reference_id AND le.entry_type = 'payment'
     WHERE le.lease_id = $1
     ORDER BY effective_date ASC, le.created_at ASC`,
    [leaseId],
  );
  return rows;
}

/** Find rent charges due on or before a date that have no completed payment.
 * Uses NOT EXISTS instead of NOT IN to avoid the NULL-in-subquery edge case
 * where any NULL charge_id in rent_payments would silently suppress all results. */
async function findUnpaidCharges(leaseId) {
  const { rows } = await query(
    `SELECT rc.* FROM rent_charges rc
     WHERE rc.lease_id = $1
       AND rc.voided_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM rent_payments rp
         WHERE rp.charge_id = rc.id AND rp.status = 'completed'
       )
     ORDER BY rc.due_date ASC`,
    [leaseId],
  );
  return rows;
}

/**
 * Create a rent charge.
 *
 * unitId is required (migration 010 — charges are unit-centric).
 * leaseId / tenantId / propertyId are optional — provide them when the
 * charge is linked to an active lease or specific tenant.
 */
async function createCharge(client, { id, unitId, leaseId, tenantId, propertyId, dueDate, amount, chargeType, description, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO rent_charges
       (id, unit_id, lease_id, tenant_id, property_id, due_date, amount, charge_type, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      id,
      unitId,
      leaseId    || null,
      tenantId   || null,
      propertyId || null,
      dueDate,
      amount,
      chargeType || 'rent',
      description || null,
      createdBy  || null,
    ],
  );
  return rows[0];
}

/**
 * For the rent reminder job.
 * Returns all active-lease rent charges due tomorrow that have no completed payment.
 * Joins to lease, tenant, user so the job has everything it needs.
 */
async function findChargesDueTomorrow() {
  const { rows } = await query(
    `SELECT rc.id            AS charge_id,
            rc.amount,
            rc.due_date,
            l.id             AS lease_id,
            l.monthly_rent,
            u.id             AS unit_id,
            u.unit_number,
            p.id             AS property_id,
            p.name           AS property_name,
            t.id             AS tenant_id,
            us.id            AS user_id,
            us.first_name,
            us.last_name,
            us.email
       FROM rent_charges rc
       JOIN leases l   ON l.id = rc.lease_id
       JOIN units u    ON u.id = rc.unit_id
       JOIN properties p ON p.id = u.property_id
       JOIN tenants t  ON t.id = l.tenant_id
       JOIN users us   ON us.id = t.user_id
      WHERE l.status = 'active'
        AND rc.due_date = CURRENT_DATE + INTERVAL '1 day'
        AND rc.charge_type = 'rent'
        AND rc.voided_at IS NULL
        AND NOT EXISTS (
              SELECT 1 FROM rent_payments rp
              WHERE rp.charge_id = rc.id AND rp.status = 'completed'
            )
      ORDER BY rc.due_date ASC`,
  );
  return rows;
}

/**
 * For the late fee job.
 * Returns active-lease rent charges that:
 *   1. Are past their due_date + lease.late_fee_grace_days
 *   2. Have no completed payment
 *   3. Have NOT yet had a late_fee charge created after the rent charge's due_date
 *      (prevents double-applying if the job runs more than once)
 */
async function findOverdueUnpaidCharges() {
  const { rows } = await query(
    `SELECT rc.id               AS charge_id,
            rc.due_date,
            rc.amount           AS rent_amount,
            l.id                AS lease_id,
            l.late_fee_amount,
            l.late_fee_grace_days,
            u.id                AS unit_id,
            u.unit_number,
            p.id                AS property_id,
            p.name              AS property_name,
            t.id                AS tenant_id,
            us.id               AS user_id,
            us.first_name,
            us.last_name,
            us.email
       FROM rent_charges rc
       JOIN leases l   ON l.id = rc.lease_id
       JOIN units u    ON u.id = rc.unit_id
       JOIN properties p ON p.id = u.property_id
       JOIN tenants t  ON t.id = l.tenant_id
       JOIN users us   ON us.id = t.user_id
      WHERE l.status = 'active'
        AND rc.charge_type   = 'rent'
        AND rc.voided_at IS NULL
        AND l.late_fee_amount > 0
        AND rc.due_date + (l.late_fee_grace_days || ' days')::INTERVAL < CURRENT_DATE
        AND NOT EXISTS (
              SELECT 1 FROM rent_payments rp
              WHERE rp.charge_id = rc.id AND rp.status = 'completed'
            )
        AND NOT EXISTS (
              SELECT 1 FROM rent_charges lf
               WHERE lf.lease_id    = l.id
                 AND lf.charge_type = 'late_fee'
                 AND lf.due_date   >= rc.due_date
            )
      ORDER BY rc.due_date ASC`,
  );
  return rows;
}

/** Find a single rent charge by its ID. */
async function findChargeById(id) {
  const { rows } = await query(
    'SELECT * FROM rent_charges WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

/**
 * List rent charges with flexible filters.
 *
 * At least one filter is required (throws otherwise). Query params are
 * combined with AND — passing multiple narrows results.
 *
 * Filter options:
 *   leaseId     — all charges for a specific lease
 *   unitId      — all charges ever billed to a unit (across leases)
 *   tenantId    — charges where rc.tenant_id matches exactly (admin/landlord use)
 *   propertyId  — all charges across every unit in a property
 *                  NOTE: matches via the units→properties JOIN (p.id), NOT the
 *                  nullable rc.property_id column, which is often unpopulated.
 *   forTenantId — tenant-portal scope: charges where the tenant is the primary
 *                  tenant OR a co-tenant on the lease. Use this instead of
 *                  `tenantId` for tenant-facing queries.
 *   ownerId     — landlord scope: all charges for properties owned by this user.
 *                  Sufficient on its own — no other filter required.
 *   unpaidOnly  — exclude charges with a completed or pending payment
 *   chargeType  — e.g. 'rent' | 'late_fee' | 'utility' | 'other'
 *
 * Each row is enriched with:
 *   unit_number, property_name, payment_id, amount_paid, payment_date,
 *   payment_method, payment_status, stripe_payment_intent_id, and a computed
 *   `status` field: 'voided' | 'paid' | 'pending' | 'unpaid'.
 *
 * @param {object} filters
 * @returns {Promise<object[]>}
 */
async function findCharges({ leaseId, unitId, tenantId, propertyId, forTenantId, unpaidOnly = false, chargeType, ownerId } = {}) {
   // ownerId alone is sufficient for landlords — they see all charges for their properties
  if (!leaseId && !unitId && !tenantId && !propertyId && !forTenantId && !ownerId) {
    throw new Error('At least one of leaseId, unitId, tenantId, propertyId, or ownerId is required');
  }

  const conditions = [];
  const values = [];

  if (leaseId)    { values.push(leaseId);    conditions.push(`rc.lease_id    = $${values.length}`); }
  if (unitId)     { values.push(unitId);     conditions.push(`rc.unit_id     = $${values.length}`); }
  if (tenantId)   { values.push(tenantId);   conditions.push(`rc.tenant_id   = $${values.length}`); }
  // Use the JOIN path (p.id) not the nullable rc.property_id column — many charges are
  // inserted without property_id populated directly on the row.
  if (propertyId) { values.push(propertyId); conditions.push(`p.id           = $${values.length}`); }
  if (chargeType) { values.push(chargeType); conditions.push(`rc.charge_type = $${values.length}`); }
  if (ownerId)    { values.push(ownerId);    conditions.push(`p.owner_id     = $${values.length}`); }
  // forTenantId: tenant-aware scope — matches charges on leases where the tenant is
  // the primary tenant OR a co-tenant (via lease_co_tenants).
  if (forTenantId) {
    values.push(forTenantId);
    const idx = values.length;
    values.push(forTenantId);
    const idx2 = values.length;
    conditions.push(
      `(rc.tenant_id = $${idx} OR rc.lease_id IN (
         SELECT lease_id FROM lease_co_tenants WHERE tenant_id = $${idx2}
       ))`,
    );
  }

  if (unpaidOnly) {
    // Include unpaid AND partially-paid charges that still need payment.
    // Exclude: voided, fully paid, or charges with an in-flight pending payment.
    conditions.push(`rc.voided_at IS NULL`);
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM rent_payments
          WHERE charge_id = rc.id AND status = 'pending'
       )`,
    );
    conditions.push(
      `COALESCE((
         SELECT SUM(amount_paid) FROM rent_payments
          WHERE charge_id = rc.id AND status = 'completed'
       ), 0) < rc.amount`,
    );
  }

  const { rows } = await query(
    `SELECT rc.*,
            u.unit_number,
            p.name                       AS property_name,
            rp.id                        AS payment_id,
            rp.amount_paid,
            rp.payment_date,
            rp.payment_method,
            rp.status                    AS payment_status,
            rp.stripe_payment_intent_id,
            rp_agg.total_paid,
            CASE
              WHEN rc.voided_at IS NOT NULL                      THEN 'voided'
              WHEN rp_agg.total_paid >= rc.amount               THEN 'paid'
              WHEN rp_agg.has_pending                            THEN 'pending'
              WHEN rp_agg.total_paid > 0                        THEN 'partial'
              ELSE 'unpaid'
            END                          AS status
       FROM rent_charges rc
       JOIN units u      ON u.id = rc.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount_paid) FILTER (WHERE status = 'completed'), 0) AS total_paid,
                bool_or(status = 'pending') AS has_pending
           FROM rent_payments
          WHERE charge_id = rc.id
       ) rp_agg ON TRUE
       LEFT JOIN LATERAL (
         SELECT * FROM rent_payments
          WHERE charge_id = rc.id
            AND status IN ('completed', 'pending')
          ORDER BY
            CASE status WHEN 'completed' THEN 1 WHEN 'pending' THEN 2 END,
            created_at DESC
          LIMIT 1
       ) rp ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY rc.due_date ASC`,
    values,
  );
  return rows;
}

/**
 * Total rent collected for a lease — sum of all completed payments.
 * Used by getLedger to show landlords how much rent has been received.
 */
async function getTotalPaid(leaseId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
     FROM rent_payments
     WHERE lease_id = $1 AND status = 'completed'`,
    [leaseId],
  );
  return rows[0] ? parseFloat(rows[0].total_paid) : 0;
}

/**
 * Update editable fields on a charge (description, due_date, charge_type).
 */
async function updateCharge(id, { description, dueDate, chargeType }) {
  const setClauses = [];
  const values = [];

  if (description !== undefined) { values.push(description); setClauses.push(`description  = $${values.length}`); }
  if (dueDate      !== undefined) { values.push(dueDate);     setClauses.push(`due_date     = $${values.length}`); }
  if (chargeType   !== undefined) { values.push(chargeType);  setClauses.push(`charge_type  = $${values.length}`); }

  if (!setClauses.length) throw new Error('No updatable fields provided');
  values.push(id);

  const { rows } = await query(
    `UPDATE rent_charges SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

/**
 * Void a charge: stamp voided_at/voided_by, and — if linked to a lease —
 * append a credit ledger entry to reverse the balance impact.
 *
 * The ledger is append-only; we never delete entries, only add a reversal.
 */
async function voidCharge({ chargeId, leaseId, amount, voidedBy, chargeType }) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check no completed payment exists for this charge
    const { rows: payments } = await client.query(
      `SELECT id FROM rent_payments WHERE charge_id = $1 AND status = 'completed' LIMIT 1`,
      [chargeId],
    );
    if (payments.length > 0) {
      const err = new Error('Cannot void a charge that already has a completed payment');
      err.status = 409;
      throw err;
    }

    const { rows } = await client.query(
      `UPDATE rent_charges SET voided_at = NOW(), voided_by = $1 WHERE id = $2 RETURNING *`,
      [voidedBy, chargeId],
    );
    const voidedCharge = rows[0];

    let ledgerEntry = null;
    if (leaseId) {
      const { rows: bal } = await client.query(
        `SELECT balance_after FROM ledger_entries WHERE lease_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [leaseId],
      );
      const currentBalance = bal[0] ? parseFloat(bal[0].balance_after) : 0;
      const balanceAfter   = parseFloat((currentBalance - amount).toFixed(2));

      const { rows: le } = await client.query(
        `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
         VALUES ($1,$2,'credit',$3,$4,$5,$6,$7) RETURNING *`,
        [
          uuidv4(),
          leaseId,
          -amount,
          balanceAfter,
          `Voided ${chargeType} charge`,
          chargeId,
          voidedBy,
        ],
      );
      ledgerEntry = le[0];
    }

    await client.query('COMMIT');
    return { charge: voidedCharge, ledgerEntry };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


/*
 *
 * Returns one row per property (aggregated from ledger_entries via leases/units).
 * Optionally filtered to a date range so you can pull a monthly or annual
 * statement for all properties, a single building, or a specific unit.
 *
 * Each row contains:
 *   property_id, property_name, address
 *   unit_count         — distinct occupied units in the period
 *   total_charged      — sum of all 'charge' entries (rent + fees billed)
 *   total_collected    — sum of all 'payment' entries (money actually received, stored as negative, returned as positive)
 *   total_credits      — sum of all 'credit'/'adjustment' entries
 *   net_income         — total_collected − total_credits (what you actually kept)
 *   outstanding        — total_charged − total_collected  (what is still owed)
 *
 * Also returns a units[] breakdown so you can drill into a single building.
 *
 * @param {{ propertyId?, fromDate?, toDate? }} opts
 *   fromDate / toDate: ISO date strings ('2026-01-01'). Default: all time.
 */
async function getPortfolioIncomeSummary({ propertyId, fromDate, toDate, ownerId } = {}) {
  const conditions = ['1=1'];
  const values = [];

  if (propertyId) {
    values.push(propertyId);
    conditions.push(`p.id = $${values.length}`);
  }
  if (ownerId) {
    values.push(ownerId);
    conditions.push(`p.owner_id = $${values.length}`);
  }
  if (fromDate) {
    values.push(fromDate);
    conditions.push(`le.created_at >= $${values.length}::date`);
  }
  if (toDate) {
    values.push(toDate);
    conditions.push(`le.created_at <  ($${values.length}::date + INTERVAL '1 day')`);
  }

  const where = conditions.join(' AND ');

  // Property-level rollup
  const { rows: propertyRows } = await query(
    `SELECT
       p.id                              AS property_id,
       p.name                            AS property_name,
       p.address_line1                   AS address,
       p.city,
       p.state,
       COUNT(DISTINCT u.id)              AS unit_count,
       COALESCE(SUM(CASE WHEN le.entry_type = 'charge'
                         THEN le.amount ELSE 0 END), 0)          AS total_charged,
       -- payments are stored as negative amounts; flip sign for readability
       COALESCE(ABS(SUM(CASE WHEN le.entry_type = 'payment'
                             THEN le.amount ELSE 0 END)), 0)      AS total_collected,
       COALESCE(ABS(SUM(CASE WHEN le.entry_type IN ('credit','adjustment')
                             THEN le.amount ELSE 0 END)), 0)      AS total_credits
     FROM ledger_entries le
     JOIN leases l      ON l.id  = le.lease_id
     JOIN units u       ON u.id  = l.unit_id
     JOIN properties p  ON p.id  = u.property_id
     WHERE ${where}
     GROUP BY p.id, p.name, p.address_line1, p.city, p.state
     ORDER BY p.name ASC`,
    values,
  );

  // Unit-level breakdown (same filters) — lets you drill into a building
  const { rows: unitRows } = await query(
    `SELECT
       u.id                              AS unit_id,
       u.unit_number,
       p.id                              AS property_id,
       COALESCE(SUM(CASE WHEN le.entry_type = 'charge'
                         THEN le.amount ELSE 0 END), 0)          AS total_charged,
       COALESCE(ABS(SUM(CASE WHEN le.entry_type = 'payment'
                             THEN le.amount ELSE 0 END)), 0)      AS total_collected,
       COALESCE(ABS(SUM(CASE WHEN le.entry_type IN ('credit','adjustment')
                             THEN le.amount ELSE 0 END)), 0)      AS total_credits
     FROM ledger_entries le
     JOIN leases l      ON l.id  = le.lease_id
     JOIN units u       ON u.id  = l.unit_id
     JOIN properties p  ON p.id  = u.property_id
     WHERE ${where}
     GROUP BY u.id, u.unit_number, p.id
     ORDER BY p.name ASC, u.unit_number ASC`,
    values,
  );

  // Attach unit rows to their parent property + compute derived fields
  const unitsByProperty = {};
  for (const row of unitRows) {
    const charged   = parseFloat(row.total_charged);
    const collected = parseFloat(row.total_collected);
    const credits   = parseFloat(row.total_credits);
    (unitsByProperty[row.property_id] ||= []).push({
      unitId:         row.unit_id,
      unitNumber:     row.unit_number,
      totalCharged:   charged,
      totalCollected: collected,
      totalCredits:   credits,
      netIncome:      collected - credits,
      outstanding:    parseFloat((charged - collected).toFixed(2)),
    });
  }

  return propertyRows.map((p) => {
    const charged   = parseFloat(p.total_charged);
    const collected = parseFloat(p.total_collected);
    const credits   = parseFloat(p.total_credits);
    return {
      propertyId:     p.property_id,
      propertyName:   p.property_name,
      address:        `${p.address}, ${p.city}, ${p.state}`,
      unitCount:      parseInt(p.unit_count, 10),
      totalCharged:   charged,
      totalCollected: collected,
      totalCredits:   credits,
      netIncome:      parseFloat((collected - credits).toFixed(2)),
      outstanding:    parseFloat((charged - collected).toFixed(2)),
      units:          unitsByProperty[p.property_id] || [],
    };
  });
}

/**
 * Return ledger entries for a lease filtered by optional date range.
 * Used for the tenant/landlord statement export.
 */
async function findStatementEntries(leaseId, { from, to } = {}) {
  const values = [leaseId];
  const conditions = ['le.lease_id = $1'];
  if (from) conditions.push(`le.created_at >= $${values.push(from)}`);
  if (to)   conditions.push(`le.created_at <  $${values.push(to)}::date + INTERVAL '1 day'`);
  const { rows } = await query(
    `SELECT
       le.id,
       le.entry_type   AS type,
       le.description,
       le.amount,
       le.balance_after AS balance,
       le.created_at   AS date
     FROM ledger_entries le
     WHERE ${conditions.join(' AND ')}
     ORDER BY le.created_at ASC
     LIMIT 5000`,
    values,
  );
  return rows;
}

module.exports = {
  getTotalPaid,
  appendEntry,
  getCurrentBalance,
  getAmountDueNow,
  findByLeaseId,
  findStatementEntries,
  findUnpaidCharges,
  createCharge,
  findChargeById,
  findCharges,
  updateCharge,
  voidCharge,
  findChargesDueTomorrow,
  findOverdueUnpaidCharges,
  getPortfolioIncomeSummary,
};
