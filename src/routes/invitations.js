const router = require('express').Router();
const { authenticate, authorize, checkPlanLimit } = require('../middleware/auth');
const controller = require('../controllers/invitationController');
const { createInvitationValidators, acceptInvitationValidators, validate } = require('../middleware/validators');

// Admin — create + list invitations
// Free tier: max 4 active tenants per landlord
router.post('/',  authenticate, authorize('admin', 'landlord'), checkPlanLimit('tenants'), createInvitationValidators, validate, controller.createInvitation);
router.get('/',   authenticate, authorize('admin', 'landlord'),                                          controller.listInvitations);

// Admin/Landlord — resend or delete an existing invitation
router.post('/:id/resend',  authenticate, authorize('admin', 'landlord'), controller.resendInvitation);
router.delete('/:id',       authenticate, authorize('admin', 'landlord'), controller.deleteInvitation);

// Public — token validation and acceptance (token in request body, not URL path)
router.post('/validate',  controller.getInvitation);
router.post('/accept',    acceptInvitationValidators, validate, controller.acceptInvitation);

module.exports = router;
