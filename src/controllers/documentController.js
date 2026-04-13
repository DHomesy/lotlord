const { v4: uuidv4 } = require('uuid');
const documentRepo = require('../dal/documentRepository');
const storage = require('../integrations/storage');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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
      docs = await documentRepo.findAll({ ownerId: req.user.sub, relatedId, relatedType, category, page, limit });
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

    const { relatedId, relatedType, category } = req.body;

    const { fileUrl } = await storage.uploadFile({
      buffer:   file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder:   'documents',
    });

    const doc = await documentRepo.create({
      id:          uuidv4(),
      ownerId:     req.user.sub,
      relatedId:   relatedId  || null,
      relatedType: relatedType || null,
      fileUrl,      // S3 key
      fileName:    file.originalname,
      fileType:    file.mimetype,
      category:    category || null,
      uploadedBy:  req.user.sub,
    });

    res.status(201).json(doc);
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
      canAccess = doc.owner_id === req.user.sub;
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
