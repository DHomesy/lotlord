const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/db');
const ledgerRepo = require('../dal/ledgerRepository');
const paymentRepo = require('../dal/paymentRepository');
const leaseRepo = require('../dal/leaseRepository');
const audit = require('./auditService');

/**
 * Get the full ledger history + current balance for a lease.
 */
async function getLedger(leaseId) {
  const [lease, entries, balance, amountDueNow, totalPaid] = await Promise.all([
    leaseRepo.findById(leaseId),
    ledgerRepo.findByLeaseId(leaseId),
    ledgerRepo.getCurrentBalance(leaseId),
    ledgerRepo.getAmountDueNow(leaseId),
    ledgerRepo.getTotalPaid(leaseId),
  ]);

  if (!lease) {
    const err = new Error('Lease not found');
    err.status = 404;
    throw err;
  }

  return { lease, entries, currentBalance: balance, amountDueNow, totalPaid };
}

/**
 * Record a manual payment (cash, check) and append to ledger — atomic.
 *
 * @param {Object} data
 * @param {string} data.leaseId
 * @param {number} data.amountPaid
 * @param {string} data.paymentDate   ISO date string
 * @param {string} data.paymentMethod 'check' | 'cash' | 'other'
 * @param {string} [data.chargeId]    Optional: link to specific charge
 * @param {string} [data.notes]
 * @param {string} createdBy          User ID of admin recording the payment
 */
async function recordManualPayment(data, createdBy) {
  const lease = await leaseRepo.findById(data.leaseId);
  if (!lease) {
    const err = new Error('Lease not found');
    err.status = 404;
    throw err;
  }

  const amount = parseFloat(data.amountPaid);

  // If a specific charge is linked, validate it before opening the transaction.
  if (data.chargeId) {
    const charge = await ledgerRepo.findChargeById(data.chargeId);
    if (!charge) throw Object.assign(new Error('Charge not found'), { status: 404 });
    if (charge.lease_id !== data.leaseId) throw Object.assign(new Error('Charge does not belong to this lease'), { status: 400 });
    if (charge.voided_at) throw Object.assign(new Error('Cannot record payment against a voided charge'), { status: 409 });
    const totalPaidSoFar = await paymentRepo.getTotalPaidForCharge(data.chargeId);
    if (totalPaidSoFar >= parseFloat(charge.amount)) {
      throw Object.assign(new Error('This charge has already been paid in full'), { status: 409 });
    }
    const remaining = parseFloat(charge.amount) - totalPaidSoFar;
    if (parseFloat(data.amountPaid) > remaining) {
      throw Object.assign(new Error('Amount exceeds the remaining balance on this charge'), { status: 400 });
    }
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const paymentId = uuidv4();
    await paymentRepo.create(client, {
      id: paymentId,
      leaseId: data.leaseId,
      chargeId: data.chargeId || null,
      amountPaid: amount,
      paymentDate: data.paymentDate,
      paymentMethod: data.paymentMethod,
      status: 'completed',
      notes: data.notes || null,
    });

    const currentBalance = await ledgerRepo.getCurrentBalance(data.leaseId);
    const balanceAfter = parseFloat((currentBalance - amount).toFixed(2));

    await ledgerRepo.appendEntry(client, {
      id: uuidv4(),
      leaseId: data.leaseId,
      entryType: 'payment',
      amount: -amount,              // negative = money coming in
      balanceAfter,
      description: data.notes || `${data.paymentMethod} payment recorded`,
      referenceId: paymentId,
      createdBy,
    });

    await client.query('COMMIT');
    audit.log({ action: 'payment_manual_created', resourceType: 'payment', resourceId: paymentId, userId: createdBy, metadata: { leaseId: data.leaseId, amount, paymentMethod: data.paymentMethod, chargeId: data.chargeId } });
    return { paymentId, balanceAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generate a monthly rent charge for a lease and append to ledger.
 * Called by the scheduled rent charge job (or manually by admin).
 */
async function createRentCharge({ leaseId, dueDate, createdBy }) {
  const lease = await leaseRepo.findById(leaseId);
  if (!lease) {
    const err = new Error('Lease not found');
    err.status = 404;
    throw err;
  }

  const amount = parseFloat(lease.monthly_rent);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const chargeId = uuidv4();
    await ledgerRepo.createCharge(client, {
      id: chargeId,
      unitId:    lease.unit_id,
      leaseId,
      tenantId:  lease.tenant_id,
      dueDate,
      amount,
      chargeType: 'rent',
      description: `Rent charge — due ${dueDate}`,
      createdBy,
    });

    const currentBalance = await ledgerRepo.getCurrentBalance(leaseId);
    const balanceAfter = parseFloat((currentBalance + amount).toFixed(2));

    await ledgerRepo.appendEntry(client, {
      id: uuidv4(),
      leaseId,
      entryType: 'charge',
      amount,
      balanceAfter,
      description: `Monthly rent — due ${dueDate}`,
      referenceId: chargeId,
      createdBy,
    });

    await client.query('COMMIT');
    return { chargeId, balanceAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply a late fee to a lease ledger.
 */
async function applyLateFee({ leaseId, createdBy }) {
  const lease = await leaseRepo.findById(leaseId);
  if (!lease) {
    const err = new Error('Lease not found');
    err.status = 404;
    throw err;
  }

  const fee = parseFloat(lease.late_fee_amount);
  if (!fee || fee <= 0) return null; // no late fee configured

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const chargeId = uuidv4();
    await ledgerRepo.createCharge(client, {
      id: chargeId,
      unitId:    lease.unit_id,
      leaseId,
      tenantId:  lease.tenant_id,
      dueDate:   new Date().toISOString().split('T')[0],
      amount:    fee,
      chargeType: 'late_fee',
      description: 'Late fee applied',
      createdBy,
    });

    const currentBalance = await ledgerRepo.getCurrentBalance(leaseId);
    const balanceAfter = parseFloat((currentBalance + fee).toFixed(2));

    await ledgerRepo.appendEntry(client, {
      id: uuidv4(),
      leaseId,
      entryType: 'charge',
      amount: fee,
      balanceAfter,
      description: 'Late fee',
      referenceId: chargeId,
      createdBy,
    });

    await client.query('COMMIT');
    return { chargeId, fee, balanceAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getLedger, recordManualPayment, createRentCharge, applyLateFee };
