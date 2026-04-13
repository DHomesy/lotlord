const { v4: uuidv4 } = require('uuid');
const tenantRepo = require('../dal/tenantRepository');
const userRepo = require('../dal/userRepository');

async function listTenants({ page, limit, ownerId }) {
  return tenantRepo.findAll({ page, limit, ownerId });
}

async function getTenant(id) {
  const tenant = await tenantRepo.findById(id);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  return tenant;
}

/**
 * Create a tenant profile for an already-existing user.
 * Called internally after a tenant accepts an invitation.
 * For admin-driven tenant creation, use the invite flow: POST /invitations.
 */
async function createTenant({ userId, emergencyContactName, emergencyContactPhone, notes }) {
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = new Error('User not found'); err.status = 404; throw err;
  }
  if (user.role !== 'tenant') {
    const err = new Error('User must have tenant role'); err.status = 400; throw err;
  }

  const existing = await tenantRepo.findByUserId(userId);
  if (existing) {
    const err = new Error('Tenant record already exists for this user'); err.status = 409; throw err;
  }

  return tenantRepo.create({ id: uuidv4(), userId, emergencyContactName, emergencyContactPhone, notes });
}

async function updateTenant(id, data) {
  await getTenant(id);
  const updated = await tenantRepo.update(id, data);
  if (!updated) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }
  return updated;
}

async function getTenantByUserId(userId) {
  const tenant = await tenantRepo.findByUserId(userId);
  if (!tenant) {
    const err = new Error('Tenant profile not found for this user');
    err.status = 404;
    throw err;
  }
  return tenant;
}

module.exports = { listTenants, getTenant, getTenantByUserId, createTenant, updateTenant };
