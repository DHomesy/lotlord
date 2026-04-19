const tenantService = require('../services/tenantService');
const leaseRepo = require('../dal/leaseRepository');
const { resolveOwnerId } = require('../lib/authHelpers');

async function listTenants(req, res, next) {
  try {
    const { page = 1, limit = 20, includePending } = req.query;
    const ownerId = (req.user.role === 'landlord' || req.user.role === 'employee') ? resolveOwnerId(req.user) : undefined;
    const tenants = await tenantService.listTenants({
      page: Number(page),
      limit: Number(limit),
      ownerId,
      includePending: includePending === 'true',
    });
    res.json(tenants);
  } catch (err) { next(err); }
}

async function getTenant(req, res, next) {
  try {
    // Landlords and employees may only view tenants on their own (or employer's) properties
    if (req.user.role === 'landlord' || req.user.role === 'employee') {
      const tenant = await tenantService.getTenant(req.params.id);
      const leases = await leaseRepo.findAll({ tenantId: tenant.id, ownerId: resolveOwnerId(req.user), limit: 1 });
      if (!leases.length) return res.status(403).json({ error: 'Forbidden' });
      return res.json(tenant);
    }
    if (req.user.role === 'tenant') {
      const tenant = await tenantService.getTenant(req.params.id);
      if (tenant.user_id !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.json(tenant);
    }
    const tenant = await tenantService.getTenant(req.params.id);
    res.json(tenant);
  } catch (err) { next(err); }
}

async function createTenant(req, res, next) {
  try {
    const { userId, email, firstName, lastName, phone, password, emergencyContactName, emergencyContactPhone, notes } = req.body;
    const tenant = await tenantService.createTenant({ 
      userId, email, firstName, lastName, phone, password,
      emergencyContactName, emergencyContactPhone, notes 
    });
    res.status(201).json(tenant);
  } catch (err) { next(err); }
}

async function updateTenant(req, res, next) {
  try {
    const tenant = await tenantService.updateTenant(req.params.id, req.body);
    res.json(tenant);
  } catch (err) { next(err); }
}

async function getTenantMe(req, res, next) {
  try {
    const tenant = await tenantService.getTenantByUserId(req.user.sub);
    res.json(tenant);
  } catch (err) { next(err); }
}

module.exports = { listTenants, getTenant, getTenantMe, createTenant, updateTenant };
