const convRepo           = require('../dal/conversationRepository');
const unmatchedInboundRepo = require('../dal/unmatchedInboundRepository');
const conversationService = require('../services/conversationService');
const { resolveOwnerId } = require('../lib/authHelpers');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 5000;
const VALID_STATUSES     = ['open', 'resolved', 'escalated'];
const VALID_CATEGORIES   = ['maintenance', 'payment', 'lease', 'general'];
const VALID_AUTOMATION_MODES = ['ai_active', 'ai_assist_only', 'human_only'];
const VALID_UNMATCHED_STATUSES = ['open', 'resolved'];
const VALID_OWNER_QA_INTENTS = ['upcoming_dues', 'past_due_tenants', 'balance_by_tenant', 'maintenance_overview'];

function hasOwnerQaPrompt(prompt) {
  return typeof prompt === 'string' && prompt.trim().length > 0;
}

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
 * GET /api/v1/inbox/unread-summary
 * Aggregate unread counts for the authenticated landlord/employee owner scope.
 */
async function getUnreadSummary(req, res, next) {
  try {
    const ownerId = resolveOwnerId(req.user);
    const summary = await convRepo.getUnreadSummary(ownerId);
    res.json(summary);
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
 * GET /api/v1/inbox/:id/trace
 * Lightweight processing trace for inbound observability.
 */
async function getConversationTrace(req, res, next) {
  try {
    const conv = await convRepo.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const err = checkOwnership(req, conv);
    if (err) return res.status(403).json({ error: err.message });

    const trace = await convRepo.getTraceSummary(conv.id);
    if (!trace) return res.status(404).json({ error: 'Trace not found' });

    res.json({
      conversationId: conv.id,
      channel: trace.channel,
      status: trace.status,
      riskState: trace.risk_state || 'normal',
      automationMode: trace.automation_mode || 'ai_active',
      needsHumanReview: !!trace.needs_human_review,
      reviewReason: trace.review_reason || null,
      unreadCount: Number(trace.unread_count || 0),
      latestInboundAt: trace.latest_inbound_at,
      latestOutboundAt: trace.latest_outbound_at,
      pendingAiDrafts: Number(trace.pending_ai_drafts || 0),
      inboundMessageCount: Number(trace.inbound_message_count || 0),
      receivedLogCount: Number(trace.received_log_count || 0),
      failedLogCount: Number(trace.failed_log_count || 0),
      latestInboundPreview: trace.latest_inbound_preview || null,
      tenantOpenUnmatchedCount: Number(trace.tenant_open_unmatched_count || 0),
      checkpoints: {
        receivedWebhook: Number(trace.received_log_count || 0) > 0,
        matchedUser: Number(trace.received_log_count || 0) > 0,
        routedToConversation: Number(trace.inbound_message_count || 0) > 0,
        queuedUnmatched: Number(trace.tenant_open_unmatched_count || 0) > 0,
        aiDraftPending: Number(trace.pending_ai_drafts || 0) > 0,
        aiSent: !!trace.latest_outbound_at,
      },
    });
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
    if (action === 'reopen')     return res.json(await conversationService.reopenConversation(conv.id));
    if (action === 'escalate')   return res.json(await conversationService.escalateConversation(conv.id, req.user.sub));
    if (action === 'mark_read')  return res.json(await conversationService.markRead(conv.id));
    if (action === 'create_maintenance_request') {
      return res.status(201).json(await conversationService.createMaintenanceRequestFromConversation(conv.id, req.user.sub));
    }
    if (action === 'owner_qa_snapshot') {
      const { intent, prompt, daysAhead, limit } = req.body;
      const normalizedIntent = String(intent || '').toLowerCase();
      if (!VALID_OWNER_QA_INTENTS.includes(normalizedIntent) && !hasOwnerQaPrompt(prompt)) {
        return res.status(400).json({
          error: `Provide either prompt text or intent (${VALID_OWNER_QA_INTENTS.join(', ')}).`,
        });
      }
      return res.json(await conversationService.getOwnerQASnapshotFromConversation(conv.id, req.user.sub, {
        intent: VALID_OWNER_QA_INTENTS.includes(normalizedIntent) ? normalizedIntent : undefined,
        prompt,
        daysAhead,
        limit,
      }));
    }
    if (action === 'set_mode') {
      const { mode } = req.body;
      if (!VALID_AUTOMATION_MODES.includes(mode)) {
        return res.status(400).json({
          error: `mode must be one of: ${VALID_AUTOMATION_MODES.join(', ')}`,
        });
      }
      return res.json(await conversationService.setAutomationMode(conv.id, mode));
    }

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
    if (action === 'reopen')    return res.json(await conversationService.reopenConversation(conv.id));
    if (action === 'escalate')  return res.json(await conversationService.escalateConversation(conv.id, req.user.sub));
    if (action === 'mark_read') return res.json(await conversationService.markRead(conv.id));
    if (action === 'create_maintenance_request') {
      return res.status(201).json(await conversationService.createMaintenanceRequestFromConversation(conv.id, req.user.sub));
    }
    if (action === 'owner_qa_snapshot') {
      const { intent, prompt, daysAhead, limit } = req.body;
      const normalizedIntent = String(intent || '').toLowerCase();
      if (!VALID_OWNER_QA_INTENTS.includes(normalizedIntent) && !hasOwnerQaPrompt(prompt)) {
        return res.status(400).json({
          error: `Provide either prompt text or intent (${VALID_OWNER_QA_INTENTS.join(', ')}).`,
        });
      }
      return res.json(await conversationService.getOwnerQASnapshotFromConversation(conv.id, req.user.sub, {
        intent: VALID_OWNER_QA_INTENTS.includes(normalizedIntent) ? normalizedIntent : undefined,
        prompt,
        daysAhead,
        limit,
      }));
    }
    if (action === 'set_mode') {
      const { mode } = req.body;
      if (!VALID_AUTOMATION_MODES.includes(mode)) {
        return res.status(400).json({
          error: `mode must be one of: ${VALID_AUTOMATION_MODES.join(', ')}`,
        });
      }
      return res.json(await conversationService.setAutomationMode(conv.id, mode));
    }

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
 * GET /api/v1/supervisor/unmatched-inbound
 * Admin-only: list unmatched inbound queue entries for review.
 */
async function listUnmatchedInbound(req, res, next) {
  try {
    const { status = 'open' } = req.query;
    const { page, limit } = parsePage(req.query);
    if (!VALID_UNMATCHED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_UNMATCHED_STATUSES.join(', ')}` });
    }

    const rows = await unmatchedInboundRepo.list({ status, page, limit });
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * PATCH /api/v1/supervisor/unmatched-inbound/:id
 * Admin-only: resolve/re-open unmatched inbound queue entries.
 * Body: { status: 'open'|'resolved', notes?: string }
 */
async function updateUnmatchedInbound(req, res, next) {
  try {
    const { status, notes } = req.body;
    if (!VALID_UNMATCHED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_UNMATCHED_STATUSES.join(', ')}` });
    }

    const updated = await unmatchedInboundRepo.updateStatus(req.params.id, {
      status,
      notes,
      reviewedBy: req.user.sub,
    });
    if (!updated) return res.status(404).json({ error: 'Queue item not found' });
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = {
  listConversations,
  getUnreadSummary,
  getConversation,
  getConversationTrace,
  updateConversation,
  sendReply,
  approveDraft,
  dismissDraft,
  listAllConversations,
  supervisorOverride,
  supervisorUpdateConversation,
  listUnmatchedInbound,
  updateUnmatchedInbound,
};
