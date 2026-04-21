const notificationService = require('../services/notificationService');
const notificationRepo    = require('../dal/notificationRepository');
const { resolveOwnerId } = require('../lib/authHelpers');

// Admin gets a null ownerId (sees everything). Landlords/employees get their own id.
function scopeOwnerId(user) {
  return user.role === 'admin' ? null : resolveOwnerId(user);
}

async function listTemplates(req, res, next) {
  try {
    const { channel, triggerEvent, page = 1, limit = 20 } = req.query;
    const templates = await notificationService.listTemplates({
      channel, triggerEvent, page: Number(page), limit: Number(limit),
    });
    res.json(templates);
  } catch (err) { next(err); }
}

async function getTemplate(req, res, next) {
  try {
    const template = await notificationService.getTemplate(req.params.id);
    res.json(template);
  } catch (err) { next(err); }
}

async function createTemplate(req, res, next) {
  try {
    const { name, channel, triggerEvent, subject, bodyTemplate } = req.body;
    const template = await notificationService.createTemplate({ name, channel, triggerEvent, subject, bodyTemplate });
    res.status(201).json(template);
  } catch (err) { next(err); }
}

async function updateTemplate(req, res, next) {
  try {
    const template = await notificationService.updateTemplate(req.params.id, req.body);
    res.json(template);
  } catch (err) { next(err); }
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * POST /notifications/send
 *
 * Two modes (determined by which fields are present):
 *
 * 1. Template send:
 *    { recipientId, templateId, variables }
 *
 * 2. Ad-hoc send:
 *    { recipientId, subject, html, text? }
 */
async function send(req, res, next) {
  try {
    const { recipientId, templateId, variables, subject, html, text } = req.body;

    let logEntry;
    if (templateId) {
      logEntry = await notificationService.sendFromTemplate({ templateId, recipientId, variables });
    } else {
      logEntry = await notificationService.sendAdhoc({ recipientId, subject, html, text });
    }
    res.status(200).json(logEntry);
  } catch (err) { next(err); }
}

/**
 * POST /notifications/send-sms
 *
 * Send an ad-hoc SMS directly to a user (no template).
 * Body: { recipientId, body }
 *
 * For template-based SMS, use POST /notifications/send with a templateId
 * pointing to an SMS-channel template.
 */
async function sendSms(req, res, next) {
  try {
    const { recipientId, body } = req.body;
    const logEntry = await notificationService.sendSmsAdhoc({ recipientId, body });
    res.status(200).json(logEntry);
  } catch (err) { next(err); }
}

async function deleteTemplate(req, res, next) {
  try {
    await notificationService.deleteTemplate(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ── Messages (conversations) ──────────────────────────────────────────────────

/**
 * GET /notifications/messages
 * Returns one row per tenant with their last message summary.
 */
async function listConversations(req, res, next) {
  try {
    const conversations = await notificationService.getConversations(scopeOwnerId(req.user));
    res.json(conversations);
  } catch (err) { next(err); }
}

/**
 * GET /notifications/messages/:tenantId
 * Returns the full message thread for a tenant.
 */
async function getConversation(req, res, next) {
  try {
    const data = await notificationService.getConversation(req.params.tenantId, scopeOwnerId(req.user));
    res.json(data);
  } catch (err) { next(err); }
}

/**
 * POST /notifications/messages
/**
 * Admin/landlord/employee sends a message to a tenant via their opted-in channel(s).
 * Landlords and employees may only message tenants belonging to their own properties.
 * Body: { tenantId, subject, body }
 */
async function sendMessage(req, res, next) {
  try {
    const { tenantId, subject, body } = req.body;
    const ownerId = scopeOwnerId(req.user);
    // Scope check: landlords/employees can only message their own tenants
    if (ownerId) {
      const owned = await notificationRepo.tenantBelongsToOwner(tenantId, ownerId);
      if (!owned) return res.status(403).json({ error: 'Forbidden' });
    }
    const results = await notificationService.sendMessage({
      tenantId,
      subject,
      body,
      senderId: req.user.sub,
    });
    res.status(201).json(results);
  } catch (err) { next(err); }
}

// ── Log ───────────────────────────────────────────────────────────────────────

async function getLog(req, res, next) {
  try {
    const { recipientId, channel, status, page = 1, limit = 20 } = req.query;
    const log = await notificationService.getLog({
      recipientId, channel, status,
      page: Number(page), limit: Number(limit),
      ownerId: scopeOwnerId(req.user),
    });
    res.json(log);
  } catch (err) { next(err); }
}

async function getLogEntry(req, res, next) {
  try {
    const entry = await notificationService.getLogEntry(req.params.id);
    res.json(entry);
  } catch (err) { next(err); }
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  send,
  sendSms,
  listConversations,
  getConversation,
  sendMessage,
  getLog,
  getLogEntry,
};
