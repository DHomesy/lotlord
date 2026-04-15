const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/userController');
const { updateUserValidators, validate } = require('../middleware/validators');

router.get('/me',    authenticate,                     controller.getMe);
router.get('/',      authenticate, authorize('admin'), controller.listUsers);
router.get('/:id',   authenticate,                     controller.getUser);
router.patch('/:id', authenticate, updateUserValidators, validate, controller.updateUser);

module.exports = router;
