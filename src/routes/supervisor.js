const router     = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/inboxController');

// All supervisor routes are admin-only
router.use(authenticate, authorize('admin'));

// ── Supervisor conversation view ──────────────────────────────────────────────
router.get('/conversations',           controller.listAllConversations);
router.patch('/conversations/:id',     controller.supervisorUpdateConversation);
router.post('/conversations/:id/override', controller.supervisorOverride);

// ── Unmatched inbound review queue ───────────────────────────────────────────
router.get('/unmatched-inbound',           controller.listUnmatchedInbound);
router.patch('/unmatched-inbound/:id',     controller.updateUnmatchedInbound);

module.exports = router;
