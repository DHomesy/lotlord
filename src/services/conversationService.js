/**
 * Conversation Service
 * ────────────────────
 * Owns the full lifecycle of tenant ↔ landlord AI-assisted conversations:
 *  - Finding or creating conversations
 *  - Appending inbound messages
 *  - Classifying messages and generating AI draft replies
 *  - Approving / dismissing AI drafts
 *  - Resolving / escalating threads
 *  - Supervisor (admin) overrides
 *  - Notifying landlords when AI sends on their behalf
 *  - Direct email thread routing via encoded Message-ID (F2)
 *
 * Conversation threading (F2):
 *   _deliverMessage() sets Message-ID: <conv-<id>-<ts>@domain> on outbound emails.
 *   _handleInbound() accepts an optional `conversationId` extracted from the tenant's
 *   In-Reply-To header, bypasses find-or-create, and routes directly to the correct
 *   thread. Tenant ownership is verified before trusting the hint to prevent
 *   cross-tenant message injection (OWASP A01).
 *
 * All functions are designed to be safe to call fire-and-forget from webhooks
 * (errors are thrown up to the caller who decides whether to log or rethrow).
 */

const { v4: uuidv4 } = require('uuid');
const env              = require('../config/env');
const convRepo         = require('../dal/conversationRepository');
const userRepo         = require('../dal/userRepository');
const tenantRepo       = require('../dal/tenantRepository');
const leaseRepo        = require('../dal/leaseRepository');
const ledgerRepo       = require('../dal/ledgerRepository');
const notificationService = require('./notificationService');
const openai           = require('../integrations/openai');

// Escalation trigger words — any match disables AI and flags the conversation.
const ESCALATION_TRIGGERS = [
  'emergency', 'flood', 'fire', 'gas leak', 'no heat', 'mold', 'uninhabitable',
  'lawyer', 'attorney', 'sue', 'lawsuit', 'eviction', 'court',
];

const AI_RATE_LIMIT_PER_DAY = 5;

// ── Public entry points (called from webhooks) ────────────────────────────────

/**
 * Handle an inbound SMS from a tenant.
 * Called fire-and-forget from the Twilio webhook handler.
 */
async function handleInboundSms({ tenantUserId, landlordId, content, logEntryId, channel = 'sms' }) {
  return _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel });
}

/**
 * Handle an inbound email from a tenant.
 * Called fire-and-forget from emailInboxService.
 */
async function handleInboundEmail({ tenantUserId, landlordId, content, logEntryId, channel = 'email', conversationId }) {
  return _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel, conversationId });
}

/**
 * Resolve the landlord for a tenant based on their active lease.
 * Used for email inbound where there is no `To` number to look up.
 */
async function resolveLandlordForTenant(tenantUserId) {
  // Step 1: resolve tenants.id from the user ID
  const tenantRecord = await tenantRepo.findByUserId(tenantUserId);
  if (!tenantRecord) return null;
  // Step 2: find their active lease (which now returns p.owner_id)
  const leases = await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'active', limit: 1 });
  return leases[0]?.owner_id || null;
}

// ── Conversation actions ──────────────────────────────────────────────────────

/**
 * Mark a conversation as resolved and clear unread count.
 */
async function resolveConversation(conversationId) {
  return convRepo.update(conversationId, { status: 'resolved', unread_count: 0 });
}

/**
 * Escalate a conversation: set status + max urgency, disable further AI drafts.
 * @param {string} conversationId
 * @param {string} actorId - The user who escalated (landlord or admin)
 */
async function escalateConversation(conversationId, actorId) {
  const conv = await convRepo.update(conversationId, { status: 'escalated', urgency: 5 });

  // Notify the landlord that they need to take over this thread
  if (conv?.owner_id) {
    notificationService.sendByTriggerEvent({
      triggerEvent: 'conversation_escalated',
      recipientId:  conv.owner_id,
      variables:    { conversation_id: conversationId },
      landlordId:   conv.owner_id,
    }).catch((err) => console.error('[conversationService] escalation notification failed:', err.message));
  }

  return conv;
}

/**
 * Mark a conversation as read (reset unread_count to 0).
 */
async function markRead(conversationId) {
  return convRepo.update(conversationId, { unread_count: 0 });
}

// ── AI approval flow ──────────────────────────────────────────────────────────

/**
 * Approve the pending AI draft for a conversation and send it.
 * @param {string} conversationId
 * @param {string} approvedBy      - UUID of the user who clicked Send
 * @param {string} [expectedMsgId] - If supplied, validated against the found draft (prevents
 *                                   approving a stale message ID after the draft was replaced).
 * @returns {object} The sent ai_messages row
 */
async function approveSuggestedReply(conversationId, approvedBy, expectedMsgId) {
  const conv = await convRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const draft = await convRepo.findPendingSuggestion(conversationId);
  if (!draft) throw Object.assign(new Error('No pending AI draft found for this conversation'), { status: 404 });

  // Validate caller's expected message ID — guards against stale UI approving the wrong draft
  if (expectedMsgId && draft.id !== expectedMsgId) {
    throw Object.assign(new Error('Message not found or no longer pending'), { status: 404 });
  }

  const landlord = await userRepo.findById(conv.owner_id);
  if (!landlord) throw Object.assign(new Error('Landlord not found'), { status: 404 });

  // Determine recipient — we need their phone/email
  const tenantUser = await _getTenantUser(conv.tenant_id);
  if (!tenantUser) throw Object.assign(new Error('Tenant user not found'), { status: 404 });

  // Atomic lock: markSent first so only one concurrent request can win.
  const sentMessage = await convRepo.markSent(draft.id, approvedBy);
  if (!sentMessage) {
    throw Object.assign(
      new Error('Draft already approved or no longer pending'),
      { status: 409 },
    );
  }

  // Attempt delivery — if it fails, reverse the DB lock so the landlord can retry.
  try {
    await _deliverMessage({
      content:  draft.content,
      channel:  conv.channel,
      tenantUser,
      landlord,
      conversationId,
    });
  } catch (deliveryErr) {
    // Best-effort reversal so the draft reappears as pending for a retry.
    await convRepo.unmarkSent(draft.id).catch((reverr) =>
      console.error('[conversationService] Failed to reverse markSent after delivery error:', reverr.message),
    );
    throw Object.assign(
      new Error('Message delivery failed. The draft has been restored — please try again.'),
      { status: 503 },
    );
  }

  // Notify landlord if configured (fire-and-forget)
  _notifyLandlordOfAiSend(landlord, {
    tenantName:     `${tenantUser.first_name} ${tenantUser.last_name}`,
    messagePreview: draft.content,
    conversationId,
  }).catch((err) => console.error('[conversationService] ai_notify failed:', err.message));

  return sentMessage;
}

/**
 * Dismiss (delete) the pending AI draft — landlord chose not to send it.
 * @param {string} conversationId
 * @param {string} [expectedMsgId] - If supplied, validated against the found draft.
 */
async function dismissSuggestedReply(conversationId, expectedMsgId) {
  const draft = await convRepo.findPendingSuggestion(conversationId);
  if (!draft) throw Object.assign(new Error('No pending AI draft found'), { status: 404 });
  if (expectedMsgId && draft.id !== expectedMsgId) {
    throw Object.assign(new Error('Message not found or no longer pending'), { status: 404 });
  }
  return convRepo.deleteSuggestion(draft.id);
}

/**
 * Send a manual reply from a landlord (not AI-generated).
 */
async function sendManualReply(conversationId, { content, senderId }) {
  const conv = await convRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const landlord  = await userRepo.findById(conv.owner_id);
  const tenantUser = await _getTenantUser(conv.tenant_id);
  if (!tenantUser) throw Object.assign(new Error('Tenant user not found'), { status: 404 });

  await _deliverMessage({ content, channel: conv.channel, tenantUser, landlord, conversationId });

  return convRepo.appendMessage({
    id:             uuidv4(),
    conversationId,
    role:           'assistant',
    content,
    suggested:      false,
    approvedBy:     senderId,
    sentAt:         new Date(),
  });
}

// ── Supervisor (admin) override ───────────────────────────────────────────────

/**
 * Inject a message into a conversation on behalf of the landlord.
 * Stored with supervisor_override = true for full audit trail.
 * @param {string} conversationId
 * @param {string} content        - The message to inject
 * @param {string} adminId        - UUID of the admin performing the override
 */
async function supervisorOverride(conversationId, content, adminId) {
  const conv = await convRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const landlord   = await userRepo.findById(conv.owner_id);
  const tenantUser = await _getTenantUser(conv.tenant_id);
  if (!tenantUser) throw Object.assign(new Error('Tenant user not found'), { status: 404 });

  // Deliver immediately
  await _deliverMessage({ content, channel: conv.channel, tenantUser, landlord, conversationId });

  return convRepo.appendMessage({
    id:                 uuidv4(),
    conversationId,
    role:               'assistant',
    content,
    suggested:          false,
    supervisorOverride: true,
    overrideBy:         adminId,
    sentAt:             new Date(),
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel, conversationId: directConvId }) {
  if (!tenantUserId) return; // Unknown sender — nothing to do

  // Look up the tenants record for this user
  const tenantRecord = await tenantRepo.findByUserId(tenantUserId);
  if (!tenantRecord) return;

  // Direct routing: if the inbound email's In-Reply-To header encoded a conversationId,
  // use it to find the exact conversation without a find-or-create round-trip.
  let conv;
  let resolvedLandlordId;

  if (directConvId) {
    conv = await convRepo.findById(directConvId);
    if (conv) {
      // Security: verify the conversation belongs to this tenant before routing.
      // An attacker could craft an In-Reply-To header with a different tenant's
      // conversation ID to inject messages into that thread. (OWASP A01: Broken Access Control)
      if (conv.tenant_id !== tenantRecord.id) {
        console.warn(
          `[conversationService] directConvId ${directConvId} belongs to tenant ${conv.tenant_id} ` +
          `but inbound message is from tenant ${tenantRecord.id} — ignoring hint, falling back to find-or-create`,
        );
        conv = null;
      } else {
        resolvedLandlordId = conv.owner_id;
      }
    } else {
      console.warn(`[conversationService] directConvId ${directConvId} not found — falling back to find-or-create`);
    }
  }

  if (!conv) {
    // If no landlord context, resolve from the tenant's active lease using the
    // already-fetched tenantRecord — avoids a second findByUserId round-trip.
    resolvedLandlordId = landlordId
      || (await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'active', limit: 1 }))[0]?.owner_id
      || null;

    // Find or create a conversation
    conv = resolvedLandlordId
      ? await convRepo.findActive({ tenantId: tenantRecord.id, ownerId: resolvedLandlordId, channel })
      : null;

    if (!conv) {
      conv = await convRepo.create({
        id:       uuidv4(),
        tenantId: tenantRecord.id,
        ownerId:  resolvedLandlordId || null,
        channel,
      });
    }
  }

  // Append the inbound message
  await convRepo.appendMessage({
    id:             uuidv4(),
    conversationId: conv.id,
    role:           'user',
    content,
    logEntryId,
  });
  await convRepo.touchOnInbound(conv.id);

  // Stop here if no landlord context or conversation is escalated
  if (!resolvedLandlordId || conv.status === 'escalated') return;

  // Check for escalation triggers first
  const lower = content.toLowerCase();
  const triggerFound = ESCALATION_TRIGGERS.find((t) => lower.includes(t));
  if (triggerFound) {
    console.warn(`[conversationService] Escalation trigger "${triggerFound}" in conversation ${conv.id}`);
    await escalateConversation(conv.id, resolvedLandlordId);
    return;
  }

  // Load landlord to check AI config
  const landlord = await userRepo.findById(resolvedLandlordId);
  if (!landlord?.ai_enabled) return;

  // Rate limit: max AI_RATE_LIMIT_PER_DAY AI replies per tenant per 24h
  const recentCount = await convRepo.countRecentAiReplies(tenantRecord.id);
  if (recentCount >= AI_RATE_LIMIT_PER_DAY) {
    console.info(`[conversationService] Rate limit hit for tenant ${tenantRecord.id} — skipping AI`);
    return;
  }

  // Build context + classify + generate draft
  const context    = await _buildContext(tenantRecord.id);
  const { category, urgency } = await openai.classifyMessage(content).catch(() => ({ category: 'general', urgency: 3 }));
  await convRepo.update(conv.id, { category, urgency });

  const history = await convRepo.findMessages(conv.id, { limit: 20 });
  const { reply, tokensUsed, model } = await openai.generateReply({
    history:    history.map((m) => ({ role: m.role, content: m.content })),
    newMessage: content,
    systemContext: context,
  });

  const draft = await convRepo.appendMessage({
    id:             uuidv4(),
    conversationId: conv.id,
    role:           'assistant',
    content:        reply,
    suggested:      true,
    tokensUsed,
    modelUsed:      model,
  });

  // Auto-send if landlord has opted in
  if (landlord.ai_reply_mode === 'auto') {
    await approveSuggestedReply(conv.id, resolvedLandlordId).catch((err) => {
      console.error(`[conversationService] Auto-send failed for conversation ${conv.id}:`, err.message);
    });
  }
}

/**
 * Build a plain-text context string injected as system context into generateReply.
 */
async function _buildContext(tenantId) {
  try {
    const leases = await leaseRepo.findAll({ tenantId, status: 'active', limit: 1 });
    if (!leases.length) return '';
    const lease   = leases[0];
    const balance = await ledgerRepo.getCurrentBalance(lease.id);
    return [
      `Property: ${lease.property_name}, Unit ${lease.unit_number}.`,
      `Tenant: ${lease.first_name} ${lease.last_name}.`,
      `Lease: ${lease.start_date} to ${lease.end_date}. Monthly rent: $${lease.monthly_rent}.`,
      `Current outstanding balance: $${balance.toFixed(2)}.`,
    ].join(' ');
  } catch (err) {
    console.warn('[conversationService] Failed to build context:', err.message);
    return '';
  }
}

/**
 * Deliver a message to the tenant via the appropriate channel.
 * Email content is plain-text wrapped in a minimal safe HTML shell so
 * raw tenant-controlled text never renders as HTML in the landlord's email.
 */
async function _deliverMessage({ content, channel, tenantUser, landlord, conversationId }) {
  if (channel === 'sms') {
    await notificationService.sendSmsAdhoc({
      recipientId: tenantUser.id,
      body:        content,
      landlordId:  landlord?.id,
    });
  } else {
    // Escape HTML special chars so tenant text cannot inject markup into the email.
    const safeHtml = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');

    // Encode the conversationId into the email's Message-ID so the tenant's reply
    // client will set In-Reply-To: <conv-<id>@...>, enabling direct thread routing.
    const domain    = (env.SES_FROM_ADDRESS || 'lotlord.app').split('@')[1] || 'lotlord.app';
    const messageId = conversationId ? `<conv-${conversationId}-${Date.now()}@${domain}>` : undefined;

    await notificationService.sendAdhoc({
      recipientId: tenantUser.id,
      subject:     'Message from your property manager',
      html:        `<p>${safeHtml}</p>`,
      text:        content,
      messageId,
    });
  }
}

/**
 * Look up the user details for a given tenants.id.
 * tenantRepo.findById already JOINs the users table, so we avoid a second
 * round-trip by constructing the user-shaped return value from that result.
 */
async function _getTenantUser(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) return null;
  // tenant.user_id is the users.id; first_name/last_name/email/phone come from the JOIN in findById.
  return { id: tenant.user_id, first_name: tenant.first_name, last_name: tenant.last_name, email: tenant.email, phone: tenant.phone };
}

/**
 * Notify a landlord that AI sent a message on their behalf.
 * Respects ai_notify_on_send + ai_notify_channels. Fire-and-forget.
 */
async function _notifyLandlordOfAiSend(landlord, { tenantName, messagePreview, conversationId }) {
  if (!landlord.ai_notify_on_send) return;
  const channels = landlord.ai_notify_channels || ['email'];
  await Promise.allSettled(
    channels.map((channel) =>
      notificationService.sendByTriggerEvent({
        triggerEvent: 'ai_sent_reply',
        recipientId:  landlord.id,
        variables: {
          tenant_name:      tenantName,
          message_preview:  messagePreview.substring(0, 100),
          conversation_id:  conversationId,
        },
        channel,
        landlordId: landlord.id,
      }),
    ),
  );
}

module.exports = {
  handleInboundSms,
  handleInboundEmail,
  resolveLandlordForTenant,
  resolveConversation,
  escalateConversation,
  markRead,
  approveSuggestedReply,
  dismissSuggestedReply,
  sendManualReply,
  supervisorOverride,
};
