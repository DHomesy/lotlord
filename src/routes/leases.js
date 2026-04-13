const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/leaseController');
const { createLeaseValidators, validate } = require('../middleware/validators');

// Filter: GET /api/v1/leases?tenantId=x&unitId=y&status=active
router.get('/',      authenticate,                                                controller.listLeases);
router.post('/',     authenticate, authorize('admin', 'landlord'), createLeaseValidators, validate, controller.createLease);
router.get('/:id',   authenticate,                                                controller.getLease);
router.patch('/:id', authenticate, authorize('admin', 'landlord'),                controller.updateLease);

module.exports = router;
