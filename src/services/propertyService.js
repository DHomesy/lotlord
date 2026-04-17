const { v4: uuidv4 } = require('uuid');
const propertyRepo = require('../dal/propertyRepository');
const userRepo     = require('../dal/userRepository');

const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * Throws 402 if the user is not on the Commercial plan.
 * Used by createProperty when propertyType === 'commercial'.
 */
async function assertCommercialPlan(user) {
  if (user?.role === 'admin') return; // admins bypass all plan checks
  const billing  = await userRepo.findBillingStatus(user.sub);
  const isActive = ACTIVE_STATUSES.includes(billing?.subscription_status);
  if (!isActive || billing?.subscription_plan !== 'commercial') {
    const err = new Error(
      'Commercial properties require a Commercial plan ($79/mo + $2/unit). Upgrade to continue.',
    );
    err.status = 402;
    err.code   = 'COMMERCIAL_REQUIRED';
    throw err;
  }
}

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
  // Commercial properties are gated behind the Commercial subscription plan
  if (data.propertyType === 'commercial') {
    await assertCommercialPlan(user);
  }
  return propertyRepo.create({ ...data, id: uuidv4(), ownerId: user.sub });
}

async function updateProperty(id, data, user) {
  const property = await getProperty(id); // ensures 404 if missing
  if (user?.role === 'landlord' && property.owner_id !== user.sub) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  // Gate type change to commercial — same plan check as createProperty
  if (data.propertyType === 'commercial' && property.property_type !== 'commercial') {
    await assertCommercialPlan(user);
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
  // Cascade archive: terminate active leases, soft-delete units, soft-delete property
  await propertyRepo.cascadeArchive(id);
}

module.exports = { listProperties, getProperty, createProperty, updateProperty, deleteProperty };
