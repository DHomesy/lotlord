const router = require('express').Router();
const { authenticate, authorize, checkPlanLimit } = require('../middleware/auth');
const controller = require('../controllers/propertyController');
const { createPropertyValidators, updatePropertyValidators, validate } = require('../middleware/validators');

router.get('/',       authenticate,                                                controller.listProperties);
router.post('/',      authenticate, authorize('admin', 'landlord'), checkPlanLimit('properties'), createPropertyValidators, validate, controller.createProperty);
router.get('/:id',    authenticate, authorize('admin', 'landlord'),                           controller.getProperty);
router.patch('/:id',  authenticate, authorize('admin', 'landlord'), updatePropertyValidators, validate, controller.updateProperty);
router.delete('/:id', authenticate, authorize('admin', 'landlord'),                controller.deleteProperty);

module.exports = router;
