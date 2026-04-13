const leaseService = require('../services/leaseService');
const tenantRepo  = require('../dal/tenantRepository');

async function listLeases(req, res, next) {
  try {
    let { tenantId, unitId, status, page = 1, limit = 20 } = req.query;
    // Tenants may only view their own leases — resolve their tenant record from user_id
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      tenantId = tenantRecord?.id;
    }
    // Landlords are scoped to leases on their own properties
    const ownerId = req.user.role === 'landlord' ? req.user.sub : undefined;
    const leases = await leaseService.listLeases({ tenantId, unitId, status, page: Number(page), limit: Number(limit), ownerId });
    res.json(leases);
  } catch (err) { next(err); }
}

async function getLease(req, res, next) {
  try {
    const lease = await leaseService.getLease(req.params.id);
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord') {
      if (lease.owner_id !== req.user.sub) {
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

module.exports = { listLeases, getLease, createLease, updateLease };
