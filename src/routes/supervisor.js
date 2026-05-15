const router     = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/inboxController');

// All supervisor routes are admin-only
router.use(authenticate, authorize('admin'));

// ── Supervisor conversation view ──────────────────────────────────────────────
router.get('/conversations',           controller.listAllConversations);
router.patch('/conversations/:id',     controller.supervisorUpdateConversation);
router.post('/conversations/:id/override', controller.supervisorOverride);

module.exports = router;
