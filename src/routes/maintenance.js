const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/maintenanceController');
const { createMaintenanceValidators, updateMaintenanceValidators, validate } = require('../middleware/validators');

// Memory storage — file buffer is passed directly to S3 via the storage integration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Requests ──────────────────────────────────────────────────────────────────
// GET    /maintenance         — admin/staff: all; tenant: own submissions
// POST   /maintenance         — any authenticated user
// GET    /maintenance/:id     — access-controlled in service
// PATCH  /maintenance/:id     — admin/staff: all fields; tenant: cancel only
router.get('/',      authenticate,                                                      controller.listRequests);
router.post('/',     authenticate, createMaintenanceValidators, validate,               controller.createRequest);
router.get('/:id',   authenticate,                                                      controller.getRequest);
router.patch('/:id', authenticate, updateMaintenanceValidators, validate,               controller.updateRequest);
router.delete('/:id', authenticate, authorize('admin'),                                 controller.deleteRequest);

// ── Attachments ───────────────────────────────────────────────────────────────
// GET    /maintenance/:id/attachments                          — list files for a request
// POST   /maintenance/:id/attachments                          — upload a file (multipart/form-data, field: "file")
// GET    /maintenance/:id/attachments/:attachmentId/download   — pre-signed S3 download URL
// DELETE /maintenance/:id/attachments/:attachmentId            — delete a file
router.get('/:id/attachments',                                        authenticate,                        controller.listAttachments);
router.post('/:id/attachments',                                       authenticate, upload.single('file'),  controller.addAttachment);
router.get('/:id/attachments/:attachmentId/download',                 authenticate,                        controller.getAttachmentDownload);
router.delete('/:id/attachments/:attachmentId',                       authenticate,                        controller.removeAttachment);

module.exports = router;
