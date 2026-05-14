const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/userController');
const { updateUserValidators, updateMeValidators, provisionSmsValidators, validate } = require('../middleware/validators');

router.get('/me',    authenticate,                     controller.getMe);
router.patch('/me',  authenticate, updateMeValidators, validate, controller.updateMe);

// ── SMS Provisioning (landlord only) ─────────────────────────────────────────
router.get('/me/sms/status',    authenticate, authorize('landlord'), controller.getMySmsStatus);
router.post('/me/sms/provision', authenticate, authorize('landlord'), provisionSmsValidators, validate, controller.provisionMySms);
router.delete('/me/sms/provision', authenticate, authorize('landlord'), controller.deprovisionMySms);

router.get('/',      authenticate, authorize('admin'), controller.listUsers);
router.get('/:id',   authenticate,                     controller.getUser);
router.patch('/:id', authenticate, updateUserValidators, validate, controller.updateUser);

module.exports = router;
