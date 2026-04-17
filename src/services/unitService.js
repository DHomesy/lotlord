const { v4: uuidv4 } = require('uuid');
const unitRepo = require('../dal/unitRepository');
const propertyRepo = require('../dal/propertyRepository');
const { query } = require('../config/db');

/**
 * Throws 422 if the property is multi-family and already has 4 units.
 * Accepts an already-fetched property object to avoid a redundant DB lookup.
 * Commercial properties have no cap at the service layer (Stripe plan gate handles that).
 * Single-family properties have exactly one unit (auto-created on property creation).
 *
 * @param {string} propertyId
 * @param {object|null} [property] - pre-fetched property row (skips findById if provided)
 */
async function assertMultiFamilyCap(propertyId, property = null) {
  const prop = property ?? await propertyRepo.findById(propertyId);
  if (!prop || prop.property_type !== 'multi') return;

  const { rows } = await query(
    'SELECT COUNT(*)::int AS cnt FROM units WHERE property_id = $1 AND deleted_at IS NULL',
    [propertyId],
  );
  if ((rows[0]?.cnt ?? 0) >= 4) {
    const err = new Error('Multi-family properties are limited to 4 units.');
    err.status = 422;
    err.code   = 'MULTI_FAMILY_CAP';
    throw err;
  }
}

async function listUnits({ propertyId, status, page, limit }, user) {
  if (propertyId) {
    const property = await propertyRepo.findById(propertyId);
    if (!property) {
      const err = new Error('Property not found');
      err.status = 404;
      throw err;
    }
    if (user?.role === 'landlord' && property.owner_id !== user.sub) {
      const err = new Error('Forbidden'); err.status = 403; throw err;
    }
  }
  const ownerId = user?.role === 'landlord' ? user.sub : undefined;
  return unitRepo.findAll({ propertyId, status, page, limit, ownerId });
}

async function getUnit(id) {
  const unit = await unitRepo.findById(id);
  if (!unit) {
    const err = new Error('Unit not found');
    err.status = 404;
    throw err;
  }
  return unit;
}

async function createUnit(data, user) {
  // Verify property exists and check ownership — single findById for both concerns
  const property = await propertyRepo.findById(data.propertyId);
  if (!property) {
    const err = new Error('Property not found');
    err.status = 404;
    throw err;
  }
  if (user?.role === 'landlord' && property.owner_id !== user.sub) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }

  // Multi-family cap: pass pre-fetched property to avoid a second findById
  await assertMultiFamilyCap(data.propertyId, property);

  const unit = await unitRepo.create({ ...data, id: uuidv4() });
  // Attach property_type so the controller can check it without a second DB query
  return { ...unit, property_type: property.property_type };
}

async function updateUnit(id, data, user) {
  const unit = await getUnit(id);
  if (user?.role === 'landlord') {
    const property = await propertyRepo.findById(unit.property_id);
    if (!property || property.owner_id !== user.sub) {
      const err = new Error('Forbidden'); err.status = 403; throw err;
    }
  }
  const updated = await unitRepo.update(id, data);
  if (!updated) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }
  return updated;
}

async function deleteUnit(id, user) {
  const unit = await getUnit(id); // 404 if not found

  // Always fetch the property — needed for both the ownership check and the Stripe sync
  // signal returned to the controller (property_type).
  const property = await propertyRepo.findById(unit.property_id);

  if (user?.role === 'landlord') {
    if (!property || property.owner_id !== user.sub) {
      const err = new Error('Forbidden'); err.status = 403; throw err;
    }
  }

  // Block deletion if any active or pending lease exists on this unit
  const { rows } = await query(
    `SELECT id FROM leases WHERE unit_id = $1 AND status IN ('active','pending') LIMIT 1`,
    [id],
  );
  if (rows.length > 0) {
    const err = new Error('Cannot delete a unit that has an active or pending lease. Terminate the lease first.');
    err.status = 409;
    throw err;
  }

  await unitRepo.remove(id);
  // Return unit augmented with property_type so the controller can trigger Stripe sync
  // without a separate DB query.
  return { ...unit, property_type: property?.property_type ?? null };
}

module.exports = { listUnits, getUnit, createUnit, updateUnit, deleteUnit, assertMultiFamilyCap };
