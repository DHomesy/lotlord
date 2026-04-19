const leaseService = require('../services/leaseService');
const leaseRepo   = require('../dal/leaseRepository');
const tenantRepo  = require('../dal/tenantRepository');
const { resolveOwnerId } = require('../lib/authHelpers');

async function listLeases(req, res, next) {
  try {
    // Tenants see all leases where they are the primary tenant OR a co-tenant
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      const leases = await leaseRepo.findAllForTenant(tenantRecord?.id);
      return res.json(leases);
    }
    let { tenantId, unitId, status, page = 1, limit = 20 } = req.query;
    // Landlords and employees are scoped to leases on their own properties
    const ownerId = (req.user.role === 'landlord' || req.user.role === 'employee') ? resolveOwnerId(req.user) : undefined;
    const leases = await leaseService.listLeases({ tenantId, unitId, status, page: Number(page), limit: Number(limit), ownerId });
    res.json(leases);
  } catch (err) { next(err); }
}

async function getLease(req, res, next) {
  try {
    const lease = await leaseService.getLease(req.params.id);
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      const canAccess = await leaseRepo.tenantCanAccessLease(req.params.id, tenantRecord?.id);
      if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (lease.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json(lease);
  } catch (err) { next(err); }
}

async function createLease(req, res, next) {
  try {
    const { unitId, tenantId, startDate, endDate, monthlyRent, depositAmount, lateFeeAmount, lateFeeGraceDays } = req.body;
    const lease = await leaseService.createLease(
      { unitId, tenantId, startDate, endDate, monthlyRent, depositAmount, lateFeeAmount, lateFeeGraceDays },
      req.user.sub,
      req.user,
    );
    res.status(201).json(lease);
  } catch (err) { next(err); }
}

async function updateLease(req, res, next) {
  try {
    const lease = await leaseService.updateLease(req.params.id, req.body, req.user);
    res.json(lease);
  } catch (err) { next(err); }
}

// ── Co-tenants ────────────────────────────────────────────────────────────────
// Co-tenants share portal access with the primary tenant but do not replace them.
// Tenants (any role) can view co-tenants on a lease they can access.
// Only admin and landlord may add or remove co-tenants.

/**
 * GET /api/v1/leases/:id/co-tenants
 *
 * Returns all co-tenants on the given lease. Tenants may only call this
 * for leases they are authorised to access (primary or co-tenant).
 */
async function getCoTenants(req, res, next) {
  try {
    const lease = await leaseService.getLease(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if (req.user.role === 'landlord' && lease.owner_id !== req.user.sub) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      const canAccess = await leaseRepo.tenantCanAccessLease(req.params.id, tenantRecord?.id);
      if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
    }
    const coTenants = await leaseRepo.findCoTenants(req.params.id);
    res.json(coTenants);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/leases/:id/co-tenants
 * Body: { tenantId: string }
 *
 * Adds a tenant as a co-tenant on this lease. The primary tenant cannot
 * be re-added as a co-tenant. Admin and landlord only.
 * Returns 201 with the new lease_co_tenants row, or the existing record
 * message if the tenant was already a co-tenant.
 */
async function addCoTenant(req, res, next) {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    const lease = await leaseService.getLease(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if (req.user.role === 'landlord' && lease.owner_id !== req.user.sub) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (lease.tenant_record_id === tenantId) {
      return res.status(400).json({ error: 'This tenant is already the primary tenant on this lease' });
    }
    const result = await leaseRepo.addCoTenant(req.params.id, tenantId);
    res.status(201).json(result ?? { message: 'Co-tenant already on lease' });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/v1/leases/:id/co-tenants/:tenantId
 *
 * Removes a co-tenant from this lease. No-op if they are not listed.
 * Admin and landlord only.
 */
async function removeCoTenant(req, res, next) {
  try {
    const lease = await leaseService.getLease(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if (req.user.role === 'landlord' && lease.owner_id !== req.user.sub) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await leaseRepo.removeCoTenant(req.params.id, req.params.tenantId);
    res.json({ message: 'Co-tenant removed' });
  } catch (err) { next(err); }
}

module.exports = { listLeases, getLease, createLease, updateLease, getCoTenants, addCoTenant, removeCoTenant };
