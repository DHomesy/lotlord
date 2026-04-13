const { v4: uuidv4 } = require('uuid');
const maintenanceRepo = require('../dal/maintenanceRepository');
const unitRepo = require('../dal/unitRepository');
const tenantRepo = require('../dal/tenantRepository');
const leaseRepo = require('../dal/leaseRepository');
const storage = require('../integrations/storage');
const audit = require('./auditService');

// ── Allowed MIME types for attachments ────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function notFound(msg = 'Maintenance request not found') {
  return Object.assign(new Error(msg), { status: 404 });
}

function forbidden(msg = 'Forbidden') {
  return Object.assign(new Error(msg), { status: 403 });
}

/**
 * Checks that the caller is allowed to view/act on this request.
 *  - admin:    unrestricted access
 *  - landlord: can only access requests on their own properties
 *  - tenant:   can only access requests they submitted
 */
function assertCanAccess(request, user) {
  if (user.role === 'admin') return;
  if (user.role === 'landlord') {
    if (request.owner_id !== user.sub) throw forbidden();
    return;
  }
  if (request.submitted_by !== user.sub) throw forbidden();
}

// ── Service methods ───────────────────────────────────────────────────────────

/**
 * List maintenance requests.
 * Tenants automatically scoped to their own submissions.
 * Supports filters: unitId, status, assignedTo (admin/staff only), page, limit.
 */
async function listRequests(user, { unitId, status, assignedTo, page = 1, limit = 20 } = {}) {
  const filters = { unitId, status, page, limit };

  if (user.role === 'tenant') {
    // Tenants can only see their own submitted requests
    filters.submittedBy = user.sub;
  } else if (user.role === 'landlord') {
    // Landlords only see requests on their own properties
    filters.ownerId = user.sub;
    if (assignedTo) filters.assignedTo = assignedTo;
  } else if (assignedTo) {
    filters.assignedTo = assignedTo;
  }

  return maintenanceRepo.findAll(filters);
}

/**
 * Get a single request by ID, enforcing access.
 */
async function getRequest(id, user) {
  const request = await maintenanceRepo.findById(id);
  if (!request) throw notFound();
  assertCanAccess(request, user);
  return request;
}

/**
 * Create a new maintenance request.
 * Validates that the unit exists.
 * Tenants can only submit for valid units (unit ownership check is enforced by lease logic; unit must exist).
 */
async function createRequest({ unitId, category, priority, title, description }, user) {
  const unit = await unitRepo.findById(unitId);
  if (!unit) throw Object.assign(new Error('Unit not found'), { status: 404 });

  // Tenants may only submit requests for units on which they have an active lease.
  if (user.role === 'tenant') {
    const tenantRecord = await tenantRepo.findByUserId(user.sub);
    if (!tenantRecord) throw forbidden('No tenant profile found');
    const leases = await leaseRepo.findAll({ tenantId: tenantRecord.id, unitId, status: 'active' });
    if (!leases.length) throw forbidden('You do not have an active lease for this unit');
  }

  const request = await maintenanceRepo.create({
    id: uuidv4(),
    unitId,
    submittedBy: user.sub,
    category,
    priority,
    title,
    description,
  });
  audit.log({ action: 'maintenance_request_created', resourceType: 'maintenance', resourceId: request.id, userId: user.sub, metadata: { unitId, category, priority, title } });
  return request;
}

/**
 * Update a maintenance request.
 * Rules:
 *  - Admin/staff can update all fields.
 *  - Tenants can only cancel their own open requests.
 * Automatically sets resolved_at when status becomes 'completed'.
 */
async function updateRequest(id, data, user) {
  const request = await maintenanceRepo.findById(id);
  if (!request) throw notFound();
  assertCanAccess(request, user);

  // Tenants may only cancel their own request
  if (user.role === 'tenant') {
    const tenantAllowedFields = new Set(['status']);
    const requestedKeys = Object.keys(data);
    const hasDisallowedKeys = requestedKeys.some(k => !tenantAllowedFields.has(k));
    if (hasDisallowedKeys) throw forbidden('Tenants may only update request status');
    if (data.status && data.status !== 'cancelled') {
      throw Object.assign(new Error('Tenants may only cancel their requests'), { status: 400 });
    }
    if (request.status !== 'open') {
      throw Object.assign(new Error('Can only cancel an open request'), { status: 409 });
    }
  }

  // Auto-set resolved_at when completing
  if (data.status === 'completed' && !data.resolvedAt) {
    data.resolvedAt = new Date().toISOString();
  }
  // Clear resolved_at if re-opening
  if (data.status === 'open' || data.status === 'in_progress') {
    data.resolvedAt = null;
  }

  const updated = await maintenanceRepo.update(id, data);
  if (!updated) throw Object.assign(new Error('No valid fields to update'), { status: 400 });
  return updated;
}

// ── Attachments ───────────────────────────────────────────────────────────────

/**
 * List all attachments for a request.
 */
async function listAttachments(requestId, user) {
  // Verifies access to parent request first
  await getRequest(requestId, user);
  return maintenanceRepo.findAttachments(requestId);
}

/**
 * Upload a file to S3 and record the attachment.
 * @param {string} requestId
 * @param {Express.Multer.File} file  — provided by multer memory storage
 * @param {object} user
 */
async function addAttachment(requestId, file, user) {
  // Verify request access
  const request = await maintenanceRepo.findById(requestId);
  if (!request) throw notFound();
  assertCanAccess(request, user);

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw Object.assign(
      new Error(`File type not allowed. Supported: ${[...ALLOWED_MIME_TYPES].join(', ')}`),
      { status: 415 },
    );
  }

  // Upload to S3
  const { fileUrl } = await storage.uploadFile({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: file.mimetype,
    folder: 'maintenance',
  });

  return maintenanceRepo.addAttachment({
    id: uuidv4(),
    requestId,
    fileUrl,
    fileName: file.originalname,
    fileType: file.mimetype,
    uploadedBy: user.sub,
  });
}

/**
 * Delete an attachment from S3 and the database.
 * Only admins/staff or the user who uploaded it can delete.
 */
async function removeAttachment(attachmentId, user) {
  const attachment = await maintenanceRepo.findAttachmentById(attachmentId);
  if (!attachment) throw Object.assign(new Error('Attachment not found'), { status: 404 });

  // Tenants can only delete their own uploads
  if (user.role === 'tenant' && attachment.uploaded_by !== user.sub) {
    throw forbidden();
  }

  try {
    // file_url is the S3 object key
    if (attachment.file_url) {
      await storage.deleteFile(attachment.file_url);
    }
  } catch {
    // Log but don't block DB cleanup if S3 deletion fails
    console.error(`Failed to delete S3 object for attachment ${attachmentId}`);
  }

  await maintenanceRepo.removeAttachment(attachmentId);
}

/**
 * Delete a maintenance request (admin/staff only).
 * Removes all S3 attachments before deleting the DB record.
 */
async function deleteRequest(id, user) {
  if (user.role === 'tenant') throw Object.assign(new Error('Forbidden'), { status: 403 });
  const request = await maintenanceRepo.findById(id);
  if (!request) throw Object.assign(new Error('Maintenance request not found'), { status: 404 });

  // Delete S3 objects for all attachments before removing DB rows
  const attachments = await maintenanceRepo.findAttachments(id);
  for (const att of attachments) {
    try {
      if (att.file_url) await storage.deleteFile(att.file_url);
    } catch {
      console.error(`[maintenance] Failed to delete S3 object for attachment ${att.id}`);
    }
  }
  await maintenanceRepo.removeAllAttachments(id);
  await maintenanceRepo.deleteById(id);
}

/**
 * Generate a pre-signed S3 download URL for a maintenance attachment.
 */
async function getAttachmentDownloadUrl(attachmentId, user) {
  const attachment = await maintenanceRepo.findAttachmentById(attachmentId);
  if (!attachment) throw Object.assign(new Error('Attachment not found'), { status: 404 });

  // Verify parent request access
  const request = await maintenanceRepo.findById(attachment.request_id);
  if (!request) throw notFound();
  assertCanAccess(request, user);

  const url = await storage.getDownloadUrl(attachment.file_url, 3600);
  return { url, fileName: attachment.file_name };
}

module.exports = {
  listRequests,
  getRequest,
  createRequest,
  updateRequest,
  deleteRequest,
  listAttachments,
  addAttachment,
  removeAttachment,
  getAttachmentDownloadUrl,
};
