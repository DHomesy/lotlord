const router = require('express').Router();
const { authenticate, authorize, checkPlanLimit } = require('../middleware/auth');
const controller = require('../controllers/propertyController');
const { createPropertyValidators, updatePropertyValidators, validate } = require('../middleware/validators');

router.get('/',       authenticate,                                                controller.listProperties);
router.post('/',      authenticate, authorize('admin', 'landlord', 'employee'), checkPlanLimit('properties'), createPropertyValidators, validate, controller.createProperty);
router.get('/:id',    authenticate, authorize('admin', 'landlord', 'employee'),                           controller.getProperty);
router.patch('/:id',  authenticate, authorize('admin', 'landlord', 'employee'), updatePropertyValidators, validate, controller.updateProperty);
router.delete('/:id', authenticate, authorize('admin', 'landlord', 'employee'),                controller.deleteProperty);

module.exports = router;
