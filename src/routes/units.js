const router = require('express').Router();
const { authenticate, authorize, checkPlanLimit } = require('../middleware/auth');
const controller = require('../controllers/unitController');
const { createUnitValidators, updateUnitValidators, validate } = require('../middleware/validators');

// Filter by property: GET /api/v1/units?propertyId=xxx&status=vacant
router.get('/',        authenticate, authorize('admin', 'landlord'),                        controller.listUnits);
router.post('/',       authenticate, authorize('admin', 'landlord'), checkPlanLimit('units'), createUnitValidators, validate, controller.createUnit);
router.get('/:id',     authenticate, authorize('admin', 'landlord'),                           controller.getUnit);
router.patch('/:id',   authenticate, authorize('admin', 'landlord'), updateUnitValidators, validate, controller.updateUnit);
router.delete('/:id',  authenticate, authorize('admin', 'landlord'),   controller.deleteUnit);

module.exports = router;
