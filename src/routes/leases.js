const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/leaseController');
const { createLeaseValidators, updateLeaseValidators, validate } = require('../middleware/validators');

// Filter: GET /api/v1/leases?tenantId=x&unitId=y&status=active
router.get('/',      authenticate,                                                controller.listLeases);
router.post('/',     authenticate, authorize('admin', 'landlord'), createLeaseValidators, validate, controller.createLease);
router.get('/:id',   authenticate,                                                controller.getLease);
router.patch('/:id', authenticate, authorize('admin', 'landlord'), updateLeaseValidators, validate, controller.updateLease);

// ── Co-tenants ───────────────────────────────────────────────────────────────
// GET    /:id/co-tenants              — all roles (tenant access checked in controller)
// POST   /:id/co-tenants              — admin, landlord only
// DELETE /:id/co-tenants/:tenantId    — admin, landlord only
router.get('/:id/co-tenants',                  authenticate,                             controller.getCoTenants);
router.post('/:id/co-tenants',                 authenticate, authorize('admin', 'landlord'), controller.addCoTenant);
router.delete('/:id/co-tenants/:tenantId',     authenticate, authorize('admin', 'landlord'), controller.removeCoTenant);

module.exports = router;
