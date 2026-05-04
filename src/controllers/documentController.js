const { v4: uuidv4 } = require('uuid');
const documentRepo = require('../dal/documentRepository');
const leaseRepo = require('../dal/leaseRepository');
const storage = require('../integrations/storage');
const notificationService = require('../services/notificationService');
const { assertMimeMatchesBytes } = require('../lib/mimeUtils');
const { resolveOwnerId } = require('../lib/authHelpers');
const { escapeHtml } = require('../lib/templateUtils');
const env = require('../config/env');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: send the tenant an email with a 24-hour pre-signed download
 * link when a landlord attaches a category='lease' document to a lease.
 */
async function notifyTenantLeaseDocument(doc, leaseId) {
  const lease = await leaseRepo.findById(leaseId);
  if (!lease?.user_id) return;

  const downloadUrl = await storage.getDownloadUrl(doc.file_url, 24 * 3600);
  const firstName   = escapeHtml(lease.first_name || 'there');
  const safeFileName = escapeHtml(doc.file_name || 'Lease Document');
  const portalUrl   = env.FRONTEND_URL || '';

  const html = `
    <p>Hi ${firstName},</p>
    <p>Your landlord has uploaded a lease document for your review:</p>
    <p><strong>${safeFileName}</strong></p>
    <p style="margin:16px 0">
      <a href="${downloadUrl}"
         style="background:#1976d2;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px">
        Download Document &rarr;
      </a>
    </p>
    <p style="color:#666;font-size:13px">
      This download link expires in 24&nbsp;hours. You can always access your documents in the tenant portal.
    </p>
    ${portalUrl ? `<p><a href="${portalUrl}/documents" style="color:#1976d2">View all documents &rarr;</a></p>` : ''}
  `;

  await notificationService.sendAdhoc({
    recipientId: lease.user_id,
    subject: 'Your lease document is ready',
    html,
  });
}


// Maps detected raw MIME (from magic bytes) to the allowed declared MIME types.
// DOCX/XLSX/PPTX are ZIP archives, so 'application/zip' covers them.
const ALLOWED_DECLARED_FOR_DETECTED = new Map([
  ['image/jpeg',         new Set(['image/jpeg'])],
  ['image/png',          new Set(['image/png'])],
  ['image/gif',          new Set(['image/gif'])],
  ['image/webp',         new Set(['image/webp'])],
  ['application/pdf',    new Set(['application/pdf'])],
  ['application/msword', new Set(['application/msword'])],
  ['application/zip',    new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
]);

// GET /documents — list documents visible to the caller
async function listDocuments(req, res, next) {
  try {
    const { relatedId, relatedType, category, page, limit } = req.query;
    let docs;
    if (req.user.role === 'tenant') {
      // Tenants cannot supply relatedId from query — scoping is enforced server-side via tenantUserId.
      // Accepting an arbitrary relatedId would let a tenant enumerate documents across any entity UUID.
      docs = await documentRepo.findAll({ tenantUserId: req.user.sub, relatedType, category, page, limit });
    } else {
      docs = await documentRepo.findAll({ ownerId: resolveOwnerId(req.user), relatedId, relatedType, category, page, limit });
    }
    res.json(docs);
  } catch (err) { next(err); }
}

// POST /documents — upload a new document (multipart/form-data, field: "file")
async function uploadDocument(req, res, next) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(415).json({ error: 'Unsupported file type' });
    }
    if (file.size > MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File exceeds the 20 MB limit' });
    }

    // Validate actual file content against magic bytes — prevents disguised executables/scripts.
    try {
      assertMimeMatchesBytes(file, ALLOWED_DECLARED_FOR_DETECTED);
    } catch (mimeErr) {
      return res.status(415).json({ error: mimeErr.message });
    }

    const { relatedId, relatedType, category } = req.body;

    const { fileUrl } = await storage.uploadFile({
      buffer:   file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder:   'documents',
    });

    const doc = await documentRepo.create({
      id:          uuidv4(),
      ownerId:     resolveOwnerId(req.user),
      relatedId:   relatedId  || null,
      relatedType: relatedType || null,
      fileUrl,      // S3 key
      fileName:    file.originalname,
      fileType:    file.mimetype,
      category:    category || null,
      uploadedBy:  req.user.sub,
    });

    // Notify tenant when a lease document is linked to a lease (fire-and-forget)
    const leaseCopySent = category === 'lease' && relatedType === 'lease' && !!relatedId;
    if (leaseCopySent) {
      notifyTenantLeaseDocument(doc, relatedId).catch((err) =>
        console.warn('[document] lease copy notification failed:', err.message),
      );
    }

    res.status(201).json({ ...doc, leaseCopySent });
  } catch (err) { next(err); }
}

// GET /documents/:id/download — returns a pre-signed URL for secure download
async function getDownloadUrl(req, res, next) {
  try {
    const doc = await documentRepo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Access check: admin always allowed; landlord must own it; tenant must be related
    let canAccess = false;
    if (req.user.role === 'admin') {
      canAccess = true;
    } else if (req.user.role === 'tenant') {
      const row = await documentRepo.findByIdForTenant(req.params.id, req.user.sub);
      canAccess = !!row;
    } else {
      canAccess = doc.owner_id === resolveOwnerId(req.user);
    }

    if (!canAccess) return res.status(403).json({ error: 'Access denied' });

    const url = await storage.getDownloadUrl(doc.file_url, 3600);
    res.json({ url, fileName: doc.file_name, expiresIn: 3600 });
  } catch (err) { next(err); }
}

// DELETE /documents/:id
async function deleteDocument(req, res, next) {
  try {
    const doc = await documentRepo.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Only the uploader or an admin may delete
    if (doc.uploaded_by !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions to delete this document' });
    }

    // Delete from S3 first
    try { await storage.deleteFile(doc.file_url); } catch (e) {
      console.warn('[documents] S3 delete failed for key', doc.file_url, e.message);
    }

    await documentRepo.remove(doc.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { listDocuments, uploadDocument, getDownloadUrl, deleteDocument };
