const router = require('express').Router();
const { authenticate, authorize, checkPlanLimit } = require('../middleware/auth');
const controller = require('../controllers/invitationController');
const { createInvitationValidators, acceptInvitationValidators, validate } = require('../middleware/validators');

// Create tenant invitation (landlord/admin/employee can invite tenants, plan-limited)
router.post('/',  authenticate, authorize('admin', 'landlord', 'employee'), checkPlanLimit('tenants'), createInvitationValidators, validate, controller.createInvitation);
router.get('/',   authenticate, authorize('admin', 'landlord', 'employee'),                                          controller.listInvitations);

// Create employee invitation (landlord/admin ONLY — employees cannot hire other employees)
router.post('/employee', authenticate, authorize('admin', 'landlord'), createInvitationValidators, validate, controller.createEmployeeInvitation);

// Resend or delete an existing invitation
router.post('/:id/resend',  authenticate, authorize('admin', 'landlord', 'employee'), controller.resendInvitation);
router.delete('/:id',       authenticate, authorize('admin', 'landlord', 'employee'), controller.deleteInvitation);

// Public — token validation and acceptance (token in request body, not URL path)
router.post('/validate',  controller.getInvitation);
router.post('/accept',    acceptInvitationValidators, validate, controller.acceptInvitation);

module.exports = router;
