const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/chargesController');
const { createChargeValidators, validate } = require('../middleware/validators');

// GET  /api/v1/charges?leaseId=xxx[&unpaidOnly=true][&chargeType=rent|late_fee|utility|other]
// Returns all charges for a lease with payment status joined in
// Landlords only see charges scoped to properties they own.
router.get('/', authenticate, controller.listCharges);

// GET  /api/v1/charges/:id
router.get('/:id', authenticate, controller.getCharge);

// POST /api/v1/charges  — admin or landlord creates a charge
// Landlords may only create charges for units in their own properties.
router.post('/', authenticate, authorize('admin', 'landlord'), createChargeValidators, validate, controller.createCharge);

// PATCH /api/v1/charges/:id  — edit description, due_date, charge_type (no payment yet)
router.patch('/:id', authenticate, authorize('admin', 'landlord'), controller.updateCharge);

// POST /api/v1/charges/:id/void  — void / cancel a charge (appends a credit to the ledger)
router.post('/:id/void', authenticate, authorize('admin', 'landlord'), controller.voidCharge);

module.exports = router;
