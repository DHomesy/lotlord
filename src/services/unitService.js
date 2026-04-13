const { v4: uuidv4 } = require('uuid');
const unitRepo = require('../dal/unitRepository');
const propertyRepo = require('../dal/propertyRepository');
const { query } = require('../config/db');

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
  // Verify property exists
  const property = await propertyRepo.findById(data.propertyId);
  if (!property) {
    const err = new Error('Property not found');
    err.status = 404;
    throw err;
  }
  if (user?.role === 'landlord' && property.owner_id !== user.sub) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  return unitRepo.create({ ...data, id: uuidv4() });
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

  if (user?.role === 'landlord') {
    const property = await propertyRepo.findById(unit.property_id);
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
  return unit;
}

module.exports = { listUnits, getUnit, createUnit, updateUnit, deleteUnit };
