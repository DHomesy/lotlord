const { Router } = require('express');
const { authenticate, authorize, requiresStarter } = require('../middleware/auth');
const { getDashboard, getOwnerQaQuality } = require('../controllers/analyticsController');

const router = Router();

// Portfolio analytics dashboard is a Starter-and-above feature
router.get('/dashboard', authenticate, authorize('admin', 'landlord', 'employee'), requiresStarter, getDashboard);
router.get('/owner-qa-quality', authenticate, authorize('admin', 'landlord', 'employee'), requiresStarter, getOwnerQaQuality);

module.exports = router;
