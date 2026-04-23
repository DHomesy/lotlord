const { v4: uuidv4 } = require('uuid');
const leaseRepo = require('../dal/leaseRepository');
const unitRepo = require('../dal/unitRepository');
const tenantRepo = require('../dal/tenantRepository');
const propertyRepo = require('../dal/propertyRepository');
const { getClient } = require('../config/db');
const ledgerRepo = require('../dal/ledgerRepository');
const audit = require('./auditService');
const notificationService = require('./notificationService');
const { resolveOwnerId } = require('../lib/authHelpers');

async function listLeases({ tenantId, unitId, status, page, limit, ownerId }) {
  return leaseRepo.findAll({ tenantId, unitId, status, page, limit, ownerId });
}

async function getLease(id) {
  const lease = await leaseRepo.findById(id);
  if (!lease) {
    const err = new Error('Lease not found');
    err.status = 404;
    throw err;
  }
  return lease;
}

async function createLease(data, createdBy, user) {
  // Validate unit exists and is vacant
  const unit = await unitRepo.findById(data.unitId);
  if (!unit) {
    const err = new Error('Unit not found');
    err.status = 404;
    throw err;
  }
  if (unit.status !== 'vacant') {
    const err = new Error(
      unit.status === 'occupied'
        ? 'Unit is already occupied'
        : 'Unit is not available (currently in maintenance)'
    );
    err.status = 409;
    throw err;
  }

  if (user?.role === 'landlord' || user?.role === 'employee') {
    const property = await propertyRepo.findById(unit.property_id);
    if (!property || property.owner_id !== resolveOwnerId(user)) {
      const err = new Error('You do not have permission to create a lease for this unit');
      err.status = 403; throw err;
    }
  }

  // Validate tenant exists
  const tenant = await tenantRepo.findById(data.tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const leaseId = uuidv4();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const lease = await leaseRepo.create({ ...data, id: leaseId });

    // Mark unit as occupied
    await unitRepo.update(data.unitId, { status: 'occupied' });

    // Deposit amount is stored on the lease record for reference.
    // Deposit charge creation is handled explicitly by the caller (Charge Schedule feature)
    // to avoid double-charging and to respect the landlord's explicit opt-in.

    await client.query('COMMIT');
    audit.log({ action: 'lease_created', resourceType: 'lease', resourceId: leaseId, userId: createdBy, metadata: { tenantId: data.tenantId, unitId: data.unitId, monthlyRent: data.monthlyRent, startDate: data.startDate, endDate: data.endDate } });

    // Fire-and-forget activation email — failure must never fail lease creation
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    ;(async () => {
      try {
        const prop = await propertyRepo.findById(unit.property_id);
        const propName = prop?.name || 'your property';
        const unitLabel = [esc(propName), unit.unit_number ? `Unit ${esc(unit.unit_number)}` : null].filter(Boolean).join(' &mdash; ');
        const rent = `$${Number(data.monthlyRent).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const html = `<p>Hi ${esc(tenant.first_name) || 'there'},</p>
<p>Your lease has been set up and is now <strong>active</strong>.</p>
<ul>
  <li><strong>Property:</strong> ${unitLabel}</li>
  <li><strong>Monthly Rent:</strong> ${rent}/month</li>
  <li><strong>Start Date:</strong> ${esc(data.startDate)}</li>
  ${data.endDate ? `<li><strong>End Date:</strong> ${esc(data.endDate)}</li>` : ''}
</ul>
<p>Log in to your tenant portal to view your lease details, upcoming charges, and pay rent online.</p>`;
        await notificationService.sendAdhoc({
          recipientId: tenant.user_id,
          subject: `Your lease is ready \u2014 ${propName}`,
          html,
          text: `Hi ${tenant.first_name || 'there'}, your lease at ${propName}${unit.unit_number ? ` Unit ${unit.unit_number}` : ''} is now active. Monthly rent: ${rent}. Start date: ${data.startDate}.`,
        });
      } catch (emailErr) {
        console.error('[createLease] activation email failed:', emailErr.message);
      }
    })();

    return lease;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateLease(id, data, user) {
  const lease = await getLease(id);
  if ((user?.role === 'landlord' || user?.role === 'employee') && lease.owner_id !== resolveOwnerId(user)) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }

  // Terminating/expiring a lease must free the unit atomically — both writes in one transaction.
  if (data.status === 'terminated' || data.status === 'expired') {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const updated = await leaseRepo.update(id, data, client);
      if (!updated) {
        const err = new Error('No valid fields to update');
        err.status = 400;
        throw err;
      }
      await unitRepo.update(lease.unit_id, { status: 'vacant' }, client);
      await client.query('COMMIT');
      audit.log({ action: 'lease_terminated', resourceType: 'lease', resourceId: id, metadata: { newStatus: data.status } });
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const updated = await leaseRepo.update(id, data);
  if (!updated) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }
  if (data.status) {
    audit.log({ action: 'lease_status_changed', resourceType: 'lease', resourceId: id, metadata: { newStatus: data.status } });
  }
  return updated;
}

module.exports = { listLeases, getLease, createLease, updateLease };
