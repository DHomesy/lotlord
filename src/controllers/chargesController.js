const { v4: uuidv4 } = require('uuid');
const ledgerRepo = require('../dal/ledgerRepository');
const tenantRepo = require('../dal/tenantRepository');
const { getClient, query } = require('../config/db');
const audit = require('../services/auditService');

/**
 * Verify that the unit belongs to a property owned by the requesting landlord.
 * Throws a 403 error if the check fails, so controllers can await this guard.
 * Admins skip the check entirely.
 */
async function assertLandlordOwnsUnit(unitId, user) {
  if (user.role === 'admin') return; // admins have unrestricted access
  const { rows } = await query(
    `SELECT p.owner_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = $1 LIMIT 1`,
    [unitId],
  );
  if (!rows[0] || rows[0].owner_id !== user.sub) {
    const err = new Error('You do not have permission to manage charges for this unit');
    err.status = 403;
    throw err;
  }
}

/**
 * GET /api/v1/charges
 *
 * Query params (at least one required):
 *   unitId      — all charges ever billed to a specific unit
 *   tenantId    — all charges linked to a specific tenant record
 *   leaseId     — all charges for a specific lease period
 *   propertyId  — all charges across all units of a property
 *
 * Optional filters:
 *   unpaidOnly=true     — exclude charges that already have a completed payment
 *   chargeType=rent|late_fee|utility|other
 *
 * Each row includes unit_number, property_name and completed payment fields
 * (payment_id, amount_paid, payment_date, payment_method, payment_status,
 *  stripe_payment_intent_id) — all NULL when unpaid.
 */
async function listCharges(req, res, next) {
  try {
    const { unitId, leaseId, propertyId, unpaidOnly, chargeType } = req.query;
    let { tenantId } = req.query;

    const isLandlord = req.user.role === 'landlord';
    const isTenant   = req.user.role === 'tenant';

    // Tenants may only view their own charges — resolve from JWT, never from query param.
    if (isTenant) {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord) return res.status(404).json({ error: 'Tenant profile not found' });
      // Force scope to their own tenantId regardless of what was passed in the query string.
      tenantId = tenantRecord.id;
    }

    // Landlords can only see charges for their own properties.
    // ownerId injected server-side means they don't need to pass an explicit filter —
    // the query will return all charges across their properties.
    const ownerId = isLandlord ? req.user.sub : undefined;

    if (!unitId && !tenantId && !leaseId && !propertyId && !isLandlord) {
      return res.status(400).json({
        error: 'At least one of unitId, tenantId, leaseId, or propertyId is required',
      });
    }

    const charges = await ledgerRepo.findCharges({
      unitId,
      tenantId,
      leaseId,
      propertyId,
      unpaidOnly: unpaidOnly === 'true',
      chargeType: chargeType || undefined,
      ownerId,
    });

    res.json(charges);
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/charges/:id
 *
 * Returns a single rent charge with its payment status.
 */
async function getCharge(req, res, next) {
  try {
    const charge = await ledgerRepo.findChargeById(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== charge.tenant_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord') {
      await assertLandlordOwnsUnit(charge.unit_id, req.user);
    }
    res.json(charge);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/charges  (admin or landlord)
 *
 * Create a rent charge for a unit. unitId is always required — the charge
 * is unit-centric. leaseId is optional: when provided the charge is linked
 * to an active lease AND a 'charge' ledger entry is appended atomically
 * (updating the tenant's running balance). Without leaseId the charge is a
 * standalone billing item (utility, cleaning fee during vacancy, etc.).
 *
 * Landlords may only create charges for units in their own properties.
 *
 * Body:
 *   {
 *     unitId:       string (required)
 *     dueDate:      string YYYY-MM-DD (required)
 *     amount:       number (required, > 0)
 *     chargeType?:  'rent' | 'late_fee' | 'utility' | 'other'  (default 'rent')
 *     description?: string
 *     leaseId?:     string — link to active lease; triggers ledger entry
 *     tenantId?:    string — link to specific tenant
 *   }
 */
async function createCharge(req, res, next) {
  try {
    const {
      unitId,
      dueDate,
      amount,
      chargeType = 'rent',
      description,
      leaseId,
      tenantId,
    } = req.body;

    // Landlords may only create charges for units they own
    await assertLandlordOwnsUnit(unitId, req.user);

    // If a leaseId is supplied, verify it belongs to the same unit being charged.
    // Without this, a landlord could link a charge to a lease on a different unit/property.
    if (leaseId) {
      const { rows: leaseRows } = await query(
        'SELECT unit_id FROM leases WHERE id = $1 LIMIT 1',
        [leaseId],
      );
      if (!leaseRows[0]) return res.status(404).json({ error: 'Lease not found' });
      if (leaseRows[0].unit_id !== unitId) {
        return res.status(400).json({ error: 'leaseId does not belong to the supplied unitId' });
      }
    }

    const chargeId = uuidv4();
    const client   = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Insert the rent charge (unit-centric; lease/tenant optional)
      const charge = await ledgerRepo.createCharge(client, {
        id:       chargeId,
        unitId,
        leaseId:   leaseId  || null,
        tenantId:  tenantId || null,
        dueDate,
        amount:    parseFloat(amount),
        chargeType,
        description: description || null,
        createdBy:   req.user.sub,
      });

      // 2. Append a ledger entry only when tied to a lease
      //    (ledger tracks the running balance per lease period)
      let ledgerEntry = null;
      if (leaseId) {
        const currentBalance = await ledgerRepo.getCurrentBalance(leaseId);
        const balanceAfter   = parseFloat((currentBalance + parseFloat(amount)).toFixed(2));
        ledgerEntry = await ledgerRepo.appendEntry(client, {
          id:          uuidv4(),
          leaseId,
          entryType:   'charge',
          amount:      parseFloat(amount),
          balanceAfter,
          description: description || `${chargeType} charge — due ${dueDate}`,
          referenceId: chargeId,
          createdBy:   req.user.sub,
        });
      }

      await client.query('COMMIT');
      audit.log({ action: 'charge_created', resourceType: 'charge', resourceId: chargeId, userId: req.user.sub, ipAddress: req.ip, metadata: { amount, chargeType, dueDate, unitId, leaseId } });
      res.status(201).json({ charge, ledgerEntry });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

/**
 * PATCH /api/v1/charges/:id  (admin or landlord)
 *
 * Update non-financial fields of a charge: description, due_date, charge_type.
 * Cannot update amount once a completed payment exists.
 * Landlords may only update charges for units in their own properties.
 */
async function updateCharge(req, res, next) {
  try {
    const charge = await ledgerRepo.findChargeById(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    if (charge.voided_at) return res.status(409).json({ error: 'Cannot edit a voided charge' });

    await assertLandlordOwnsUnit(charge.unit_id, req.user);

    const { description, dueDate, chargeType } = req.body;
    const updated = await ledgerRepo.updateCharge(req.params.id, {
      description,
      dueDate,
      chargeType,
    });
    res.json(updated);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/charges/:id/void  (admin or landlord)
 *
 * Soft-deletes a charge by stamping voided_at/voided_by.
 * If the charge is linked to a lease, a credit ledger entry is appended to
 * reverse the balance impact.
 * Cannot void a charge that already has a completed payment.
 */
async function voidCharge(req, res, next) {
  try {
    const charge = await ledgerRepo.findChargeById(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    if (charge.voided_at) return res.status(409).json({ error: 'Charge is already voided' });

    await assertLandlordOwnsUnit(charge.unit_id, req.user);

    const result = await ledgerRepo.voidCharge({
      chargeId:  charge.id,
      leaseId:   charge.lease_id,
      amount:    parseFloat(charge.amount),
      voidedBy:  req.user.sub,
      chargeType: charge.charge_type,
    });
    audit.log({ action: 'charge_voided', resourceType: 'charge', resourceId: charge.id, userId: req.user.sub, ipAddress: req.ip, metadata: { amount: charge.amount, chargeType: charge.charge_type, leaseId: charge.lease_id } });
    res.json(result);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/charges/batch  (admin or landlord)
 *
 * Creates multiple charges in a single DB transaction — prevents connection-pool
 * exhaustion that occurs when firing N concurrent POST /charges requests.
 *
 * Body: { charges: [{ unitId, dueDate, amount, leaseId?, tenantId?, chargeType?, description? }] }
 */
async function createChargesBatch(req, res, next) {
  try {
    const { charges } = req.body;
    // Input shape, size (1-500), UUID/date/amount/chargeType format all validated by middleware.
    // Ownership and lease-unit cross-checks are business logic — done here.

    // Verify landlord owns all unique unitIds
    const unitIds = [...new Set(charges.map((c) => c.unitId))];
    for (const unitId of unitIds) {
      await assertLandlordOwnsUnit(unitId, req.user);
    }

    // Verify each unique leaseId belongs to the corresponding unitId
    const checkedLeases = new Set();
    for (const c of charges) {
      if (c.leaseId && !checkedLeases.has(c.leaseId)) {
        const { rows } = await query('SELECT unit_id FROM leases WHERE id = $1 LIMIT 1', [c.leaseId]);
        if (!rows[0]) return res.status(404).json({ error: `Lease ${c.leaseId} not found` });
        if (rows[0].unit_id !== c.unitId) {
          return res.status(400).json({ error: 'leaseId does not belong to the supplied unitId' });
        }
        checkedLeases.add(c.leaseId);
      }
    }

    const client = await getClient();
    // Track cumulative balance per leaseId within this transaction so each
    // ledger entry has the correct balance_after without re-reading mid-txn.
    const balanceCache = {};
    const created = [];

    try {
      await client.query('BEGIN');

      for (const c of charges) {
        const chargeId = uuidv4();
        const charge = await ledgerRepo.createCharge(client, {
          id:          chargeId,
          unitId:      c.unitId,
          leaseId:     c.leaseId     || null,
          tenantId:    c.tenantId    || null,
          dueDate:     c.dueDate,
          amount:      parseFloat(c.amount),
          chargeType:  c.chargeType  || 'rent',
          description: c.description || null,
          createdBy:   req.user.sub,
        });
        created.push(charge);

        if (c.leaseId) {
          // Read the committed balance once per lease; accumulate in memory thereafter
          if (balanceCache[c.leaseId] === undefined) {
            balanceCache[c.leaseId] = await ledgerRepo.getCurrentBalance(c.leaseId);
          }
          balanceCache[c.leaseId] = parseFloat(
            (balanceCache[c.leaseId] + parseFloat(c.amount)).toFixed(2),
          );
          await ledgerRepo.appendEntry(client, {
            id:           uuidv4(),
            leaseId:      c.leaseId,
            entryType:    'charge',
            amount:       parseFloat(c.amount),
            balanceAfter: balanceCache[c.leaseId],
            description:  c.description || `${c.chargeType || 'rent'} charge — due ${c.dueDate}`,
            referenceId:  chargeId,
            createdBy:    req.user.sub,
          });
        }
      }

      await client.query('COMMIT');
      audit.log({
        action: 'charges_batch_created', resourceType: 'charge', userId: req.user.sub,
        ipAddress: req.ip, metadata: { count: created.length },
      });
      res.status(201).json({ charges: created });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/charges/void-by-unit  (admin or landlord)
 *
 * Voids all non-voided, unpaid charges for a given unit in one transaction.
 * Used before replacing a charge schedule with a new one.
 *
 * Body: { unitId }
 */
async function voidChargesByUnit(req, res, next) {
  try {
    const { unitId } = req.body;
    // unitId UUID format validated by middleware; ownership checked here.
    await assertLandlordOwnsUnit(unitId, req.user);

    const { rows: toVoid } = await query(
      `SELECT rc.id, rc.amount, rc.lease_id, rc.charge_type
         FROM rent_charges rc
        WHERE rc.unit_id = $1
          AND rc.voided_at IS NULL
          AND rc.id NOT IN (
                SELECT charge_id FROM rent_payments
                 WHERE status = 'completed' AND charge_id IS NOT NULL
              )`,
      [unitId],
    );

    if (toVoid.length === 0) return res.json({ voided: 0 });

    const client = await getClient();
    const balanceCache = {};

    try {
      await client.query('BEGIN');

      for (const c of toVoid) {
        await client.query(
          `UPDATE rent_charges SET voided_at = NOW(), voided_by = $1 WHERE id = $2`,
          [req.user.sub, c.id],
        );

        if (c.lease_id) {
          if (balanceCache[c.lease_id] === undefined) {
            const { rows: bal } = await client.query(
              `SELECT balance_after FROM ledger_entries WHERE lease_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [c.lease_id],
            );
            balanceCache[c.lease_id] = bal[0] ? parseFloat(bal[0].balance_after) : 0;
          }
          balanceCache[c.lease_id] = parseFloat(
            (balanceCache[c.lease_id] - parseFloat(c.amount)).toFixed(2),
          );
          await client.query(
            `INSERT INTO ledger_entries
               (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
             VALUES ($1,$2,'credit',$3,$4,$5,$6,$7)`,
            [
              uuidv4(), c.lease_id, -parseFloat(c.amount), balanceCache[c.lease_id],
              `Voided ${c.charge_type} charge`, c.id, req.user.sub,
            ],
          );
        }
      }

      await client.query('COMMIT');
      audit.log({
        action: 'charges_bulk_voided', resourceType: 'charge', userId: req.user.sub,
        ipAddress: req.ip, metadata: { unitId, count: toVoid.length },
      });
      res.json({ voided: toVoid.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

module.exports = { listCharges, getCharge, createCharge, updateCharge, voidCharge, createChargesBatch, voidChargesByUnit };
