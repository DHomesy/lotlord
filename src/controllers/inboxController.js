const convRepo           = require('../dal/conversationRepository');
const conversationService = require('../services/conversationService');
const { resolveOwnerId } = require('../lib/authHelpers');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 5000;
const VALID_STATUSES     = ['open', 'resolved', 'escalated'];
const VALID_CATEGORIES   = ['maintenance', 'payment', 'lease', 'general'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePage(query) {
  return {
    page:  Math.max(1, parseInt(query.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 30)),
  };
}

/**
 * Returns a 403 error if the requesting user doesn't own the conversation.
 * Admins always pass. Returns null if access is allowed.
 */
function checkOwnership(req, conv) {
  if (req.user.role === 'admin') return null;
  const ownerId = resolveOwnerId(req.user);
  if (conv.owner_id !== ownerId) {
    return Object.assign(new Error('Access denied'), { status: 403 });
  }
  return null;
}

/**
 * Validate direct-update fields (status, urgency, category).
 * Returns an error string if invalid, null otherwise.
 */
function validateFieldUpdate({ status, urgency, category }) {
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (urgency !== undefined) {
    const u = Number(urgency);
    if (!Number.isInteger(u) || u < 1 || u > 5) return 'urgency must be an integer between 1 and 5';
  }
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
  }
  return null;
}

// ── Landlord Inbox ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/inbox
 * List conversations for the authenticated landlord (or their employee's employer).
 * Admin sees conversations for a specific landlord if ?ownerId= is supplied,
 * otherwise the supervisor endpoint should be used instead.
 */
async function listConversations(req, res, next) {
  try {
    const ownerId = resolveOwnerId(req.user);
    const { status, urgency } = req.query;
    const { page, limit } = parsePage(req.query);

    const conversations = await convRepo.findAllByOwner(ownerId, {
      status,
      urgency: urgency ? parseInt(urgency, 10) : undefined,
      page,
      limit,
    });
    res.json(conversations);
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/inbox/:id
 * Fetch a conversation thread (conversation metadata + all messages).
 * Landlords/employees can only access their own conversations.
 * Admins can access any.
 */
async function getConversation(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const err = checkOwnership(req, conv);
    if (err) return res.status(403).json({ error: err.message });

    const messages = await convRepo.findMessages(conv.id);
    res.json({ conversation: conv, messages });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/v1/inbox/:id
 * Update conversation metadata: status, urgency, category, unread_count.
 * Landlords/employees can only update their own conversations.
 */
async function updateConversation(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const ownerErr = checkOwnership(req, conv);
    if (ownerErr) return res.status(403).json({ error: ownerErr.message });

    // Handle convenience actions
    const { action } = req.body;
    if (action === 'resolve')    return res.json(await conversationService.resolveConversation(conv.id));
    if (action === 'escalate')   return res.json(await conversationService.escalateConversation(conv.id, req.user.sub));
    if (action === 'mark_read')  return res.json(await conversationService.markRead(conv.id));

    // Direct field update — validate before hitting the DB
    const { status, urgency, category } = req.body;
    if (status === undefined && urgency === undefined && category === undefined) {
      return res.status(400).json({ error: 'Provide action or at least one field: status, urgency, category' });
    }
    const validErr = validateFieldUpdate({ status, urgency, category });
    if (validErr) return res.status(400).json({ error: validErr });

    const updated = await convRepo.update(conv.id, { status, urgency, category });
    res.json(updated);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/inbox/:id/reply
 * Send a manual (non-AI) reply in a conversation.
 * Body: { content: string }
 */
async function sendReply(req, res, next) {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: `content must be ${MAX_CONTENT_LENGTH} characters or fewer` });
    }

    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const ownerErr = checkOwnership(req, conv);
    if (ownerErr) return res.status(403).json({ error: ownerErr.message });

    const message = await conversationService.sendManualReply(conv.id, {
      content: content.trim(),
      senderId: req.user.sub,
    });
    res.status(201).json(message);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/inbox/:id/messages/:msgId/approve
 * Approve a pending AI draft and send it.
 */
async function approveDraft(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const ownerErr = checkOwnership(req, conv);
    if (ownerErr) return res.status(403).json({ error: ownerErr.message });

    const message = await conversationService.approveSuggestedReply(conv.id, req.user.sub, req.params.msgId);
    res.json(message);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/v1/inbox/:id/messages/:msgId
 * Dismiss (delete) a pending AI draft.
 */
async function dismissDraft(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const ownerErr = checkOwnership(req, conv);
    if (ownerErr) return res.status(403).json({ error: ownerErr.message });

    await conversationService.dismissSuggestedReply(conv.id, req.params.msgId);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ── Supervisor (admin) ────────────────────────────────────────────────────────

/**
 * GET /api/v1/supervisor/conversations
 * Admin-only: list all conversations across all landlords.
 * Supports ?status=, ?urgency=, ?ownerId= (filter by landlord), ?page=, ?limit=
 */
async function listAllConversations(req, res, next) {
  try {
    const { status, urgency, ownerId } = req.query;
    const { page, limit } = parsePage(req.query);

    const conversations = await convRepo.findAllForSupervisor({
      status,
      urgency: urgency ? parseInt(urgency, 10) : undefined,
      ownerId,
      page,
      limit,
    });
    res.json(conversations);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/supervisor/conversations/:id/override
 * Admin injects a message on behalf of the landlord.
 * Body: { content: string }
 * Stored with supervisor_override = true for full audit trail.
 */
async function supervisorOverride(req, res, next) {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: `content must be ${MAX_CONTENT_LENGTH} characters or fewer` });
    }

    const message = await conversationService.supervisorOverride(
      req.params.id,
      content.trim(),
      req.user.sub,
    );
    res.status(201).json(message);
  } catch (err) { next(err); }
}

/**
 * PATCH /api/v1/supervisor/conversations/:id
 * Admin updates any conversation (status, urgency, category).
 * Mirrors updateConversation but without the ownership check.
 */
async function supervisorUpdateConversation(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { action } = req.body;
    if (action === 'resolve')   return res.json(await conversationService.resolveConversation(conv.id));
    if (action === 'escalate')  return res.json(await conversationService.escalateConversation(conv.id, req.user.sub));
    if (action === 'mark_read') return res.json(await conversationService.markRead(conv.id));

    const { status, urgency, category } = req.body;
    if (status === undefined && urgency === undefined && category === undefined) {
      return res.status(400).json({ error: 'Provide action or at least one field: status, urgency, category' });
    }
    const validErr = validateFieldUpdate({ status, urgency, category });
    if (validErr) return res.status(400).json({ error: validErr });

    const updated = await convRepo.update(conv.id, { status, urgency, category });
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = {
  listConversations,
  getConversation,
  updateConversation,
  sendReply,
  approveDraft,
  dismissDraft,
  listAllConversations,
  supervisorOverride,
  supervisorUpdateConversation,
};
