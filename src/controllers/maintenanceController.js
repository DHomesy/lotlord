const maintenanceService = require('../services/maintenanceService');

async function listRequests(req, res, next) {
  try {
    const { unitId, status, assignedTo, page = 1, limit = 20 } = req.query;
    const requests = await maintenanceService.listRequests(req.user, {
      unitId,
      status,
      assignedTo,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(requests);
  } catch (err) { next(err); }
}

async function getRequest(req, res, next) {
  try {
    const request = await maintenanceService.getRequest(req.params.id, req.user);
    res.json(request);
  } catch (err) { next(err); }
}

async function createRequest(req, res, next) {
  try {
    const { unitId, category, priority, title, description } = req.body;
    const request = await maintenanceService.createRequest(
      { unitId, category, priority, title, description },
      req.user,
    );
    res.status(201).json(request);
  } catch (err) { next(err); }
}

async function updateRequest(req, res, next) {
  try {
    const request = await maintenanceService.updateRequest(req.params.id, req.body, req.user);
    res.json(request);
  } catch (err) { next(err); }
}

// ── Attachments ───────────────────────────────────────────────────────────────

async function listAttachments(req, res, next) {
  try {
    const attachments = await maintenanceService.listAttachments(req.params.id, req.user);
    res.json(attachments);
  } catch (err) { next(err); }
}

async function addAttachment(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a file in the "file" field.' });
    }
    const attachment = await maintenanceService.addAttachment(req.params.id, req.file, req.user);
    res.status(201).json(attachment);
  } catch (err) { next(err); }
}

async function removeAttachment(req, res, next) {
  try {
    await maintenanceService.removeAttachment(req.params.attachmentId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function getAttachmentDownload(req, res, next) {
  try {
    const { url, fileName } = await maintenanceService.getAttachmentDownloadUrl(req.params.attachmentId, req.user);
    res.json({ url, fileName, expiresIn: 3600 });
  } catch (err) { next(err); }
}

async function deleteRequest(req, res, next) {
  try {
    await maintenanceService.deleteRequest(req.params.id, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
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
  getAttachmentDownload,
};
