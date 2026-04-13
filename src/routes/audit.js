const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/auditController');

// Only admins may view the audit log
router.get('/', authenticate, authorize('admin'), controller.listEntries);

module.exports = router;
