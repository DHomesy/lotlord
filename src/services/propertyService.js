const { v4: uuidv4 } = require('uuid');
const propertyRepo = require('../dal/propertyRepository');
const unitRepo = require('../dal/unitRepository');

async function listProperties({ user, page, limit }) {
  // Tenants only see properties they are assigned to (via active leases) — handled by future scope
  // For now admin/staff see all
  return propertyRepo.findAll({ ownerId: user.role === 'admin' ? undefined : user.sub, page, limit });
}

async function getProperty(id) {
  const property = await propertyRepo.findById(id);
  if (!property) {
    const err = new Error('Property not found');
    err.status = 404;
    throw err;
  }
  return property;
}

async function createProperty(data, user) {
  return propertyRepo.create({ ...data, id: uuidv4(), ownerId: user.sub });
}

async function updateProperty(id, data, user) {
  const property = await getProperty(id); // ensures 404 if missing
  if (user?.role === 'landlord' && property.owner_id !== user.sub) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  const updated = await propertyRepo.update(id, data);
  if (!updated) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }
  return updated;
}

async function deleteProperty(id, user) {
  const property = await getProperty(id);
  if (user?.role === 'landlord' && property.owner_id !== user.sub) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  // Guard: don't delete if units exist
  const units = await unitRepo.findAll({ propertyId: id, limit: 1 });
  if (units.length) {
    const err = new Error('Cannot delete a property that has units. Remove or reassign units first.');
    err.status = 409;
    throw err;
  }
  await propertyRepo.remove(id);
}

module.exports = { listProperties, getProperty, createProperty, updateProperty, deleteProperty };
