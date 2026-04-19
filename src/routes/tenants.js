const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/tenantController');
const { createTenantValidators, updateTenantValidators, validate } = require('../middleware/validators');

router.get('/',      authenticate, authorize('admin', 'landlord', 'employee'),                           controller.listTenants);
router.post('/',     authenticate, authorize('admin'),          createTenantValidators, validate, controller.createTenant);
router.get('/me',    authenticate, authorize('tenant'),                                      controller.getTenantMe);
router.get('/:id',   authenticate, authorize('admin', 'landlord', 'tenant'),                 controller.getTenant);
router.patch('/:id', authenticate, authorize('admin'),          updateTenantValidators, validate, controller.updateTenant);

module.exports = router;
