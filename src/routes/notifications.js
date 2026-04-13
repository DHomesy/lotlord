const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/notificationController');
const {
  createTemplateValidators,
  updateTemplateValidators,
  sendNotificationValidators,
  sendSmsValidators,
  validate,
} = require('../middleware/validators');

// All notification routes are admin-only
const adminOnly = [authenticate, authorize('admin')];

// ── Templates ───────────────────────────────────────────────────────────────
router.get('/templates',        ...adminOnly,                                          controller.listTemplates);
router.post('/templates',       ...adminOnly, createTemplateValidators, validate,       controller.createTemplate);
router.get('/templates/:id',    ...adminOnly,                                          controller.getTemplate);
router.patch('/templates/:id',  ...adminOnly, updateTemplateValidators, validate,       controller.updateTemplate);
router.delete('/templates/:id', ...adminOnly,                                          controller.deleteTemplate);

// ── Messages (admin-initiated conversations) ─────────────────────────────────
router.get('/messages',           ...adminOnly, controller.listConversations);
router.get('/messages/:tenantId', ...adminOnly, controller.getConversation);
router.post('/messages',          ...adminOnly, controller.sendMessage);

// ── Send ─────────────────────────────────────────────────────────────────────
router.post('/send',          ...adminOnly, sendNotificationValidators, validate,     controller.send);
router.post('/send-sms',      ...adminOnly, sendSmsValidators, validate,              controller.sendSms);

// ── Log ─────────────────────────────────────────────────────────────────────
router.get('/log',            ...adminOnly,                                          controller.getLog);
router.get('/log/:id',        ...adminOnly,                                          controller.getLogEntry);

module.exports = router;
