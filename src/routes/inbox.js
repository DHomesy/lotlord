const router     = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/inboxController');

// All inbox routes require authentication.
// Landlords, employees, and admins are all permitted — ownership scoping is
// enforced per-handler so employees only see their employer's conversations.
router.use(authenticate, authorize('landlord', 'employee', 'admin'));

// ── Conversation list + detail ────────────────────────────────────────────────
router.get('/',    controller.listConversations);
router.get('/:id', controller.getConversation);

// ── Conversation actions ──────────────────────────────────────────────────────
router.patch('/:id', controller.updateConversation);

// ── Message actions ───────────────────────────────────────────────────────────
router.post('/:id/reply',                     controller.sendReply);
router.post('/:id/messages/:msgId/approve',   controller.approveDraft);
router.delete('/:id/messages/:msgId',         controller.dismissDraft);

module.exports = router;
