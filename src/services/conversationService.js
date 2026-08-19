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
const maintenanceRepo  = require('../dal/maintenanceRepository');
const notificationService = require('./notificationService');
const aiPromptAssemblyService = require('./aiPromptAssemblyService');
const maintenanceTriageService = require('./maintenanceTriageService');
const ownerQaService = require('./ownerQaService');
const audit = require('./auditService');
const openai           = require('../integrations/openai');

// Hard escalation: severe safety/legal signals that require urgent human intervention.
const HARD_ESCALATION_PATTERNS = [
  { label: 'active_fire', pattern: /\b(active\s+fire|house\s+on\s+fire|building\s+on\s+fire|fire\s+alarm\s+going\s+off)\b/i },
  { label: 'gas_leak', pattern: /\b(gas\s+leak|smell\s+gas|carbon\s+monoxide)\b/i },
  { label: 'severe_injury', pattern: /\b(someone\s+is\s+hurt|medical\s+emergency|ambulance)\b/i },
  { label: 'legal_threat', pattern: /\b(lawsuit|i\s+will\s+sue|attorney\s+letter|court\s+order|restraining\s+order)\b/i },
];

// Soft review: keep AI triage active (mode permitting), while notifying for attention.
const SOFT_REVIEW_PATTERNS = [
  { label: 'emergency_wording', pattern: /\bemergency\b/i },
  { label: 'flood_or_leak', pattern: /\b(flood|burst\s+pipe|major\s+leak|water\s+coming\s+through)\b/i },
  { label: 'habitability', pattern: /\b(no\s+heat|no\s+hot\s+water|mold|uninhabitable)\b/i },
];

const AI_RATE_LIMIT_PER_DAY = 5;
const AUTOMATION_MODES = ['ai_active', 'ai_assist_only', 'human_only'];

function findPolicyTrigger(text, definitions) {
  return definitions.find((entry) => entry.pattern.test(text || '')) || null;
}

function buildEmergencyDraft(triggerLabel) {
  const reason = triggerLabel ? triggerLabel.replace(/_/g, ' ') : 'safety concern';
  return `Thanks for reporting this quickly. This appears to be urgent (${reason}), so I am escalating it to the property manager for immediate follow-up. If there is any immediate danger, please call emergency services and move to a safe location first.`;
}

// ── Public entry points (called from webhooks) ────────────────────────────────

/**
 * Handle an inbound SMS from a tenant.
 * Called fire-and-forget from the inbound SMS webhook handler.
 */
async function handleInboundSms({ tenantUserId, landlordId, content, logEntryId, channel = 'sms' }) {
  return _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel });
}

/**
 * Handle an inbound email from a tenant.
 * Called fire-and-forget from emailInboxService.
 */
async function handleInboundEmail({ tenantUserId, landlordId, content, logEntryId, channel = 'email', conversationId, inboundMessageId }) {
  return _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel, conversationId, inboundMessageId });
}

/**
 * Resolve the landlord for a tenant based on their active lease.
 * Used for email inbound where there is no `To` number to look up.
 */
async function resolveLandlordForTenant(tenantUserId) {
  // Step 1: resolve tenants.id from the user ID
  const tenantRecord = await tenantRepo.findByUserId(tenantUserId);
  if (!tenantRecord) return null;
  // Step 2: prefer active lease owner; fallback to pending so early-thread replies are still routed.
  const active = await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'active', limit: 1 });
  if (active[0]?.owner_id) return active[0].owner_id;
  const pending = await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'pending', limit: 1 });
  return pending[0]?.owner_id || null;
}

// ── Conversation actions ──────────────────────────────────────────────────────

/**
 * Mark a conversation as resolved and clear unread count.
 */
async function resolveConversation(conversationId) {
  return convRepo.update(conversationId, { status: 'resolved', unread_count: 0 });
}

/**
 * Re-open a conversation so inbound messages continue through normal AI workflow.
 */
async function reopenConversation(conversationId) {
  return convRepo.update(conversationId, {
    status: 'open',
    risk_state: 'normal',
    needs_human_review: false,
    review_reason: null,
    automation_mode: 'ai_active',
  });
}

/**
 * Escalate a conversation: set status + max urgency, disable further AI drafts.
 * @param {string} conversationId
 * @param {string} actorId - The user who escalated (landlord or admin)
 */
async function escalateConversation(conversationId, actorId) {
  const conv = await convRepo.update(conversationId, {
    status: 'escalated',
    urgency: 5,
    risk_state: 'elevated',
    needs_human_review: true,
    review_reason: actorId ? `escalated_by:${actorId}` : 'escalated',
  });

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

/**
 * Explicitly set the conversation automation mode.
 */
async function setAutomationMode(conversationId, mode) {
  if (!AUTOMATION_MODES.includes(mode)) {
    throw Object.assign(new Error('Invalid automation mode'), { status: 400 });
  }
  return convRepo.update(conversationId, { automation_mode: mode });
}

/**
 * Create a maintenance request from a triaged maintenance conversation.
 * Requires all triage slots (issue, onset_time, location) to be present.
 */
async function createMaintenanceRequestFromConversation(conversationId, actorId) {
  const conv = await convRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.category !== 'maintenance') {
    throw Object.assign(new Error('Conversation is not categorized as maintenance'), { status: 409 });
  }
  if (String(conv.review_reason || '').startsWith('maintenance_request_created:')) {
    throw Object.assign(new Error('Maintenance request already created for this conversation'), { status: 409 });
  }

  const slots = {
    issue: conv.maintenance_issue,
    onset_time: conv.maintenance_onset_time,
    location: conv.maintenance_location,
  };
  const missingFields = maintenanceTriageService.getMissingFields(slots);
  if (missingFields.length) {
    throw Object.assign(
      new Error(`Cannot create maintenance request until required fields are captured: ${missingFields.join(', ')}`),
      { status: 409 },
    );
  }

  let leases = await leaseRepo.findAll({ tenantId: conv.tenant_id, ownerId: conv.owner_id, status: 'active', limit: 1 });
  if (!Array.isArray(leases) || !leases.length) {
    leases = await leaseRepo.findAll({ tenantId: conv.tenant_id, ownerId: conv.owner_id, status: 'pending', limit: 1 });
  }
  if (!Array.isArray(leases) || !leases.length || !leases[0].unit_id) {
    throw Object.assign(new Error('No eligible lease/unit found for this tenant conversation'), { status: 409 });
  }

  const tenant = await tenantRepo.findById(conv.tenant_id);
  if (!tenant?.user_id) {
    throw Object.assign(new Error('Tenant user not found for conversation'), { status: 404 });
  }

  const category = maintenanceTriageService.inferMaintenanceCategory({ slots });
  const priority = maintenanceTriageService.inferMaintenancePriority({
    slots,
    urgency: conv.urgency,
  });
  const title = String(slots.issue || 'Maintenance request').trim().slice(0, 180) || 'Maintenance request';
  const description = [
    `Issue: ${slots.issue}`,
    `When started: ${slots.onset_time}`,
    `Location: ${slots.location}`,
    `Source conversation: ${conv.id}`,
  ].join('\n');

  const request = await maintenanceRepo.create({
    id: uuidv4(),
    unitId: leases[0].unit_id,
    submittedBy: tenant.user_id,
    category,
    priority,
    title,
    description,
  });

  audit.log({
    action: 'maintenance_request_created_from_conversation',
    resourceType: 'maintenance',
    resourceId: request.id,
    userId: actorId || conv.owner_id || null,
    metadata: {
      conversationId: conv.id,
      ownerId: conv.owner_id,
      tenantId: conv.tenant_id,
      priority,
      category,
    },
  });

  const updatedConversation = await convRepo.update(conv.id, {
    needs_human_review: true,
    review_reason: `maintenance_request_created:${request.id}`,
  });

  await convRepo.appendMessage({
    id: uuidv4(),
    conversationId: conv.id,
    role: 'system',
    content: `Maintenance request created (${request.id}) for follow-up.`,
    suggested: false,
  });

  return {
    conversation: updatedConversation,
    maintenanceRequest: request,
  };
}

/**
 * Run a deterministic owner-scoped portfolio snapshot query from conversation context.
 */
async function getOwnerQASnapshotFromConversation(conversationId, actorId, { intent, prompt, daysAhead, limit } = {}) {
  const conv = await convRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (!conv.owner_id) {
    throw Object.assign(new Error('Conversation is not associated with an owner scope'), { status: 409 });
  }

  const snapshot = await ownerQaService.getOwnerSnapshot({
    ownerId: conv.owner_id,
    intent,
    prompt,
    daysAhead,
    limit,
  });

  audit.log({
    action: 'owner_qa_snapshot_requested',
    resourceType: 'ai_conversation',
    resourceId: conv.id,
    userId: actorId || conv.owner_id || null,
    metadata: {
      ownerId: conv.owner_id,
      intent: snapshot.intent,
      promptProvided: !!String(prompt || '').trim(),
      itemCount: Array.isArray(snapshot.items) ? snapshot.items.length : 0,
      dateContext: snapshot.dateContext,
    },
  });

  try {
    await convRepo.appendMessage({
      id: uuidv4(),
      conversationId: conv.id,
      role: 'system',
      content: `Owner Q&A snapshot generated (${snapshot.intent}). ${snapshot.summary}`,
      suggested: false,
    });
  } catch (err) {
    // Snapshot generation should still succeed even if a trace message write fails.
    console.warn('[conversationService] Failed to append owner QA trace message:', err.message);
  }

  return {
    conversationId: conv.id,
    snapshot,
  };
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
      threadId: conv.thread_id,
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

  await _deliverMessage({ content, channel: conv.channel, tenantUser, landlord, conversationId, threadId: conv.thread_id });

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
  await _deliverMessage({ content, channel: conv.channel, tenantUser, landlord, conversationId, threadId: conv.thread_id });

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

async function _handleInbound({ tenantUserId, landlordId, content, logEntryId, channel, conversationId: directConvId, inboundMessageId }) {
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
    if (landlordId) {
      resolvedLandlordId = landlordId;
    } else {
      const activeLease = await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'active', limit: 1 });
      resolvedLandlordId = activeLease[0]?.owner_id || null;
      if (!resolvedLandlordId) {
        const pendingLease = await leaseRepo.findAll({ tenantId: tenantRecord.id, status: 'pending', limit: 1 });
        resolvedLandlordId = pendingLease[0]?.owner_id || null;
      }
    }

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

  // For email threads, keep the latest inbound Message-ID as reply anchor.
  if (channel === 'email' && inboundMessageId) {
    await convRepo.update(conv.id, { thread_id: inboundMessageId });
    conv.thread_id = inboundMessageId;
  }

  if (resolvedLandlordId) {
    _notifyLandlordOfTenantReply(resolvedLandlordId, {
      tenantName: `${tenantRecord.first_name || ''} ${tenantRecord.last_name || ''}`.trim() || 'Tenant',
      messagePreview: content,
      conversationId: conv.id,
      channel,
    }).catch((err) => console.error('[conversationService] tenant_reply notification failed:', err.message));
  }

  // Stop here if no landlord context or conversation policy explicitly requires human-only mode.
  if (!resolvedLandlordId || conv.automation_mode === 'human_only') return;

  // Check escalation/review policy first.
  const lower = content.toLowerCase();
  const hardTrigger = findPolicyTrigger(lower, HARD_ESCALATION_PATTERNS);
  if (hardTrigger) {
    console.warn(`[conversationService] Escalation trigger "${hardTrigger.label}" in conversation ${conv.id}`);
    await convRepo.appendMessage({
      id: uuidv4(),
      conversationId: conv.id,
      role: 'assistant',
      content: buildEmergencyDraft(hardTrigger.label),
      suggested: true,
    });
    await escalateConversation(conv.id, resolvedLandlordId);
    return;
  }

  const softTrigger = findPolicyTrigger(lower, SOFT_REVIEW_PATTERNS);
  if (softTrigger) {
    await convRepo.update(conv.id, {
      risk_state: 'elevated',
      needs_human_review: true,
      review_reason: `soft_review_trigger:${softTrigger.label}`,
    });
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

  const updateFields = { category, urgency };

  const history = await convRepo.findMessages(conv.id, { limit: 100 });
  let policyContext = context;

  if (category === 'maintenance') {
    const extractedSlots = maintenanceTriageService.deriveMaintenanceSlots({
      history: history.map((m) => ({ content: m.content })),
      newMessage: content,
    });

    const persistedSlots = {
      issue: conv.maintenance_issue,
      onset_time: conv.maintenance_onset_time,
      location: conv.maintenance_location,
    };

    const triageSlots = maintenanceTriageService.mergeSlots(persistedSlots, extractedSlots);
    const missingFields = maintenanceTriageService.getMissingFields(triageSlots);

    updateFields.maintenance_issue = triageSlots.issue;
    updateFields.maintenance_onset_time = triageSlots.onset_time;
    updateFields.maintenance_location = triageSlots.location;
    updateFields.maintenance_missing_fields = missingFields;

    const triageGuidance = maintenanceTriageService.buildMaintenanceGuidance({
      slots: triageSlots,
      missingFields,
    });

    policyContext = [context, triageGuidance].filter(Boolean).join('\n\n');
  }

  await convRepo.update(conv.id, updateFields);

  const promptEnvelope = await aiPromptAssemblyService.buildPromptEnvelope({
    workflowType: aiPromptAssemblyService.WORKFLOW_TYPES.TENANT_TRIAGE,
    conversationId: conv.id,
    tenantId: tenantRecord.id,
    ownerId: resolvedLandlordId,
    policyContext,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    newMessage: content,
  });

  const { reply, tokensUsed, model } = await openai.generateReply({
    history:    promptEnvelope.history,
    newMessage: content,
    systemContext: promptEnvelope.systemContext,
    routingContext: {
      riskState: conv.risk_state,
      needsHumanReview: !!conv.needs_human_review || !!softTrigger,
    },
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

  // Auto-send only in full automation mode. In assist-only mode we keep drafts pending.
  if (landlord.ai_reply_mode === 'auto' && conv.automation_mode === 'ai_active') {
    const guardrail = await notificationService.canAutoSendSmsForOwner({
      ownerId: resolvedLandlordId,
      body: reply,
    }).catch(() => ({ allowed: true, reason: null }));
    if (guardrail?.allowed === false) {
      // Switch to approval mode when guardrails are exceeded.
      await userRepo.update(resolvedLandlordId, { ai_reply_mode: 'suggest' });
      console.warn(
        `[conversationService] Auto-send blocked for owner ${resolvedLandlordId}: ${guardrail.reason}. ` +
        'Switched ai_reply_mode to suggest.',
      );
      return draft;
    }

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
    if (!Array.isArray(leases) || !leases.length) return '';
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
async function _deliverMessage({ content, channel, tenantUser, landlord, conversationId, threadId }) {
  if (channel === 'sms') {
    let body = content;
    try {
      const tenant = await tenantRepo.findByUserId(tenantUser.id);
      const leases = tenant
        ? await leaseRepo.findAll({ tenantId: tenant.id, status: 'active', limit: 1 })
        : [];
      const lease = Array.isArray(leases) ? leases[0] : null;
      const propertyName = lease?.property_name || 'Property Manager';
      body = `${content}\n- ${propertyName} via LotLord`;
    } catch (err) {
      console.warn('[conversationService] Failed to append SMS signature:', err.message);
    }

    await notificationService.sendSmsAdhoc({
      recipientId: tenantUser.id,
      body,
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

    const inReplyTo = threadId || undefined;
    const references = inReplyTo || undefined;

    await notificationService.sendAdhoc({
      recipientId: tenantUser.id,
      subject:     'Message from your property manager',
      html:        `<p>${safeHtml}</p>`,
      text:        content,
      messageId,
      inReplyTo,
      references,
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

/**
 * Notify landlord when a tenant reply is received and routed.
 */
async function _notifyLandlordOfTenantReply(landlordId, { tenantName, messagePreview, conversationId, channel }) {
  await notificationService.sendByTriggerEvent({
    triggerEvent: 'tenant_reply_received',
    recipientId: landlordId,
    variables: {
      tenant_name: tenantName,
      message_preview: String(messagePreview || '').substring(0, 140),
      conversation_id: conversationId,
      channel,
    },
    channel: 'email',
    landlordId,
  });
}

module.exports = {
  handleInboundSms,
  handleInboundEmail,
  resolveLandlordForTenant,
  resolveConversation,
  reopenConversation,
  escalateConversation,
  createMaintenanceRequestFromConversation,
  getOwnerQASnapshotFromConversation,
  setAutomationMode,
  markRead,
  approveSuggestedReply,
  dismissSuggestedReply,
  sendManualReply,
  supervisorOverride,
};
