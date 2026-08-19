const router     = require('express').Router();
const { authenticate, authorize, requiresStarter } = require('../middleware/auth');
const {
	ownerQaPortalSnapshotLimiter,
	ownerQaConversationActionLimiter,
} = require('../middleware/ownerQaRateLimit');
const controller = require('../controllers/inboxController');

// All inbox routes require authentication.
// Landlords, employees, and admins are all permitted — ownership scoping is
// enforced per-handler so employees only see their employer's conversations.
router.use(authenticate, authorize('landlord', 'employee', 'admin'), requiresStarter);

// ── Conversation list + detail ────────────────────────────────────────────────
router.get('/unread-summary', controller.getUnreadSummary);
router.post('/owner-qa/snapshot', authorize('landlord'), ownerQaPortalSnapshotLimiter, controller.getOwnerQaSnapshot);
router.get('/owner-qa/sessions', authorize('landlord'), controller.listOwnerQaSessions);
router.post('/owner-qa/sessions', authorize('landlord'), controller.createOwnerQaSession);
router.get('/owner-qa/sessions/:sessionId', authorize('landlord'), controller.getOwnerQaSession);
router.patch('/owner-qa/sessions/:sessionId', authorize('landlord'), controller.updateOwnerQaSession);
router.delete('/owner-qa/sessions/:sessionId', authorize('landlord'), controller.deleteOwnerQaSession);
router.post('/owner-qa/sessions/:sessionId/snapshot', authorize('landlord'), ownerQaPortalSnapshotLimiter, controller.createOwnerQaSessionSnapshot);
router.get('/',    controller.listConversations);
router.get('/:id/trace', controller.getConversationTrace);
router.get('/:id', controller.getConversation);

// ── Conversation actions ──────────────────────────────────────────────────────
router.patch('/:id', ownerQaConversationActionLimiter, controller.updateConversation);

// ── Message actions ───────────────────────────────────────────────────────────
router.post('/:id/reply',                     controller.sendReply);
router.post('/:id/messages/:msgId/approve',   controller.approveDraft);
router.delete('/:id/messages/:msgId',         controller.dismissDraft);

module.exports = router;
