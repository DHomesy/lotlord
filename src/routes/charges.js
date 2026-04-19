const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/chargesController');
const { createChargeValidators, updateChargeValidators, createChargesBatchValidators, voidChargesByUnitValidators, validate } = require('../middleware/validators');

// GET  /api/v1/charges?leaseId=xxx[&unpaidOnly=true][&chargeType=rent|late_fee|utility|other]
// Returns all charges for a lease with payment status joined in
// Landlords only see charges scoped to properties they own.
router.get('/', authenticate, controller.listCharges);

// GET  /api/v1/charges/:id
router.get('/:id', authenticate, controller.getCharge);

// POST /api/v1/charges  — admin or landlord creates a charge
// Landlords may only create charges for units in their own properties.
router.post('/', authenticate, authorize('admin', 'landlord', 'employee'), createChargeValidators, validate, controller.createCharge);

// POST /api/v1/charges/batch — create multiple charges in one DB transaction
// Must be declared before /:id routes so Express doesn't treat "batch" as an id param.
router.post('/batch', authenticate, authorize('admin', 'landlord', 'employee'), createChargesBatchValidators, validate, controller.createChargesBatch);

// POST /api/v1/charges/void-by-unit — void all unpaid charges for a unit (bulk replace)
router.post('/void-by-unit', authenticate, authorize('admin', 'landlord', 'employee'), voidChargesByUnitValidators, validate, controller.voidChargesByUnit);

// PATCH /api/v1/charges/:id  — edit description, due_date, charge_type (no payment yet)
router.patch('/:id', authenticate, authorize('admin', 'landlord', 'employee'), updateChargeValidators, validate, controller.updateCharge);

// POST /api/v1/charges/:id/void  — void / cancel a charge (appends a credit to the ledger)
router.post('/:id/void', authenticate, authorize('admin', 'landlord', 'employee'), controller.voidCharge);

module.exports = router;
