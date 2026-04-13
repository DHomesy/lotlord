const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');

router.get('/conversations',              authenticate, authorize('admin'), (req, res) => res.status(501).json({ message: 'Not implemented yet' }));
router.get('/conversations/:id/messages', authenticate, authorize('admin'), (req, res) => res.status(501).json({ message: 'Not implemented yet' }));

module.exports = router;
