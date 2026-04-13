const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/userController');

router.get('/me',    authenticate,                     controller.getMe);
router.get('/',      authenticate, authorize('admin'), controller.listUsers);
router.get('/:id',   authenticate,                     controller.getUser);
router.patch('/:id', authenticate,                     controller.updateUser);

module.exports = router;
