const router     = require('express').Router();
const multer     = require('multer');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/documentController');

// multer: in-memory storage, 20 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// GET    /documents              — list (landlord sees their own; tenant sees their related docs)
// POST   /documents              — upload (multipart/form-data, field: "file")
// GET    /documents/:id/download — pre-signed S3 download URL
// DELETE /documents/:id          — remove record + delete from S3

router.get('/',              authenticate,                        controller.listDocuments);
router.post('/',             authenticate, upload.single('file'), controller.uploadDocument);
router.get('/:id/download',  authenticate,                        controller.getDownloadUrl);
router.delete('/:id',        authenticate,                        controller.deleteDocument);

module.exports = router;
