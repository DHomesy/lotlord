const { Router } = require('express');
const { authenticate, authorize, requiresPro } = require('../middleware/auth');
const { getDashboard } = require('../controllers/analyticsController');

const router = Router();

// Portfolio analytics dashboard is Pro-only
router.get('/dashboard', authenticate, authorize('admin', 'landlord'), requiresPro, getDashboard);

module.exports = router;
