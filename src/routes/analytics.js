const { Router } = require('express');
const { authenticate, authorize, requiresStarter } = require('../middleware/auth');
const { getDashboard } = require('../controllers/analyticsController');

const router = Router();

// Portfolio analytics dashboard is a Starter-and-above feature
router.get('/dashboard', authenticate, authorize('admin', 'landlord'), requiresStarter, getDashboard);

module.exports = router;
