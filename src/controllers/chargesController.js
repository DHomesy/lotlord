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
    const { unitId, tenantId, leaseId, propertyId, unpaidOnly, chargeType } = req.query;

    // Landlords can only see charges for their own properties.
    // ownerId injected server-side means they don't need to pass an explicit filter —
    // the query will return all charges across their properties.
    const isLandlord = req.user.role === 'landlord';
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

module.exports = { listCharges, getCharge, createCharge, updateCharge, voidCharge };
