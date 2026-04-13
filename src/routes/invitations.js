const router = require('express').Router();
const { authenticate, authorize, checkFreeTierLimit } = require('../middleware/auth');
const controller = require('../controllers/invitationController');
const { createInvitationValidators, acceptInvitationValidators, validate } = require('../middleware/validators');

// Admin — create + list invitations
// Free tier: max 4 active tenants per landlord
router.post('/',  authenticate, authorize('admin', 'landlord'), checkFreeTierLimit('tenants', 4), createInvitationValidators, validate, controller.createInvitation);
router.get('/',   authenticate, authorize('admin', 'landlord'),                                          controller.listInvitations);

// Admin/Landlord — resend or delete an existing invitation
router.post('/:id/resend',  authenticate, authorize('admin', 'landlord'), controller.resendInvitation);
router.delete('/:id',       authenticate, authorize('admin', 'landlord'), controller.deleteInvitation);

// Public — token validation and acceptance (no auth required)
router.get('/:token',         controller.getInvitation);
router.post('/:token/accept', acceptInvitationValidators, validate, controller.acceptInvitation);

module.exports = router;
