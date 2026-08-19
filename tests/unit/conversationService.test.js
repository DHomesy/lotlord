/**
 * Unit tests for src/services/conversationService.js
 *
 * All external dependencies are mocked — no DB, Twilio, or OpenAI calls.
 * Run: npm run test:unit
 */

jest.mock('../../src/dal/conversationRepository');
jest.mock('../../src/dal/userRepository');
jest.mock('../../src/dal/tenantRepository');
jest.mock('../../src/dal/leaseRepository');
jest.mock('../../src/dal/ledgerRepository');
jest.mock('../../src/dal/maintenanceRepository');
jest.mock('../../src/services/notificationService');
jest.mock('../../src/services/auditService');
jest.mock('../../src/services/ownerQaService');
jest.mock('../../src/integrations/openai');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const convRepo           = require('../../src/dal/conversationRepository');
const userRepo           = require('../../src/dal/userRepository');
const tenantRepo         = require('../../src/dal/tenantRepository');
const leaseRepo          = require('../../src/dal/leaseRepository');
const ledgerRepo         = require('../../src/dal/ledgerRepository');
const maintenanceRepo    = require('../../src/dal/maintenanceRepository');
const notificationService = require('../../src/services/notificationService');
const audit              = require('../../src/services/auditService');
const ownerQaService     = require('../../src/services/ownerQaService');
const openai             = require('../../src/integrations/openai');
const conversationService = require('../../src/services/conversationService');

// ── Shared test fixtures ──────────────────────────────────────────────────────

const TENANT_USER_ID  = 'tenant-user-uuid';
const LANDLORD_ID     = 'landlord-uuid';
const TENANT_ID       = 'tenant-record-uuid';
const CONV_ID         = 'conv-uuid';
const LOG_ENTRY_ID    = 'log-entry-uuid';
const MESSAGE_CONTENT = 'Hi, my tap is leaking.';

const mockTenantRecord = { id: TENANT_ID, user_id: TENANT_USER_ID, first_name: 'Ten', last_name: 'Ant', email: 'ten@test.com', phone: null };
const mockConversation = {
  id: CONV_ID, tenant_id: TENANT_ID, owner_id: LANDLORD_ID,
  channel: 'sms', status: 'open', urgency: 3, automation_mode: 'ai_active',
};
const mockLandlord = {
  id: LANDLORD_ID, first_name: 'Land', last_name: 'Lord',
  ai_enabled: true, ai_reply_mode: 'approval',
  ai_notify_on_send: false, ai_notify_channels: ['email'],
};
const mockTenantUser = { id: TENANT_USER_ID, first_name: 'Ten', last_name: 'Ant' };
const mockDraft = {
  id: 'msg-uuid', conversation_id: CONV_ID, role: 'assistant',
  content: 'We will send a plumber.', suggested: true, sent_at: null,
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  notificationService.canAutoSendSmsForOwner = jest.fn().mockResolvedValue({ allowed: true, reason: null });
});

// ── handleInboundSms ──────────────────────────────────────────────────────────

describe('handleInboundSms', () => {
  function setupHappyPath({ replyMode = 'approval', aiEnabled = true, existingConv = null } = {}) {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(existingConv);
    convRepo.create.mockResolvedValue(mockConversation);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_reply_mode: replyMode, ai_enabled: aiEnabled });
    convRepo.countRecentAiReplies.mockResolvedValue(0);
    openai.classifyMessage.mockResolvedValue({ category: 'maintenance', urgency: 2, summary: 'Leak' });
    convRepo.update.mockResolvedValue({ ...mockConversation, category: 'maintenance', urgency: 2 });
    convRepo.findMessages.mockResolvedValue([]);
    openai.generateReply.mockResolvedValue({ reply: 'We will send a plumber.', tokensUsed: 10, model: 'gpt-4o-mini' });
  }

  test('creates new conversation when none exists', async () => {
    setupHappyPath();
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.findActive).toHaveBeenCalledWith({ tenantId: TENANT_ID, ownerId: LANDLORD_ID, channel: 'sms' });
    expect(convRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID, ownerId: LANDLORD_ID, channel: 'sms' }));
  });

  test('reuses existing open conversation', async () => {
    setupHappyPath({ existingConv: mockConversation });
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.create).not.toHaveBeenCalled();
  });

  test('appends inbound message and touches conversation', async () => {
    setupHappyPath({ existingConv: mockConversation });
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user', content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    }));
    expect(convRepo.touchOnInbound).toHaveBeenCalledWith(CONV_ID);
  });

  test('classifies message and generates AI draft when landlord has ai_enabled=true', async () => {
    setupHappyPath({ existingConv: mockConversation });
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(openai.classifyMessage).toHaveBeenCalledWith(MESSAGE_CONTENT);
    expect(openai.generateReply).toHaveBeenCalled();
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant', suggested: true,
    }));
  });

  test('persists merged maintenance triage slots and injects triage guidance into AI context', async () => {
    const existingConv = {
      ...mockConversation,
      maintenance_issue: null,
      maintenance_onset_time: null,
      maintenance_location: 'kitchen',
      maintenance_missing_fields: ['issue', 'onset_time'],
    };

    setupHappyPath({ existingConv });
    openai.classifyMessage.mockResolvedValue({ category: 'maintenance', urgency: 2, summary: 'Leak' });
    convRepo.findMessages.mockResolvedValue([
      { role: 'user', content: 'My sink is leaking badly.' },
      { role: 'assistant', content: 'When did this start?' },
      { role: 'user', content: 'It started yesterday.' },
    ]);

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID,
      landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT,
      logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, expect.objectContaining({
      category: 'maintenance',
      maintenance_issue: expect.any(String),
      maintenance_onset_time: expect.any(String),
      maintenance_location: 'kitchen',
      maintenance_missing_fields: expect.any(Array),
    }));

    const generateArgs = openai.generateReply.mock.calls[0][0];
    expect(generateArgs.systemContext).toContain('Maintenance triage policy:');
    expect(generateArgs.systemContext).toContain('Required fields: issue, onset_time, location.');
  });

  test('notifies landlord when a tenant reply is received', async () => {
    setupHappyPath({ existingConv: mockConversation });
    notificationService.sendByTriggerEvent = jest.fn().mockResolvedValue({});

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(notificationService.sendByTriggerEvent).toHaveBeenCalledWith(expect.objectContaining({
      triggerEvent: 'tenant_reply_received',
      recipientId: LANDLORD_ID,
      channel: 'email',
    }));
  });

  test('skips AI when landlord has ai_enabled=false', async () => {
    setupHappyPath({ existingConv: mockConversation, aiEnabled: false });
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(openai.generateReply).not.toHaveBeenCalled();
  });

  test('skips AI when tenantUserId is not found', async () => {
    tenantRepo.findByUserId.mockResolvedValue(null);
    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.appendMessage).not.toHaveBeenCalled();
  });

  test('skips AI when rate limit is reached', async () => {
    setupHappyPath({ existingConv: mockConversation });
    convRepo.countRecentAiReplies.mockResolvedValue(5);

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(openai.generateReply).not.toHaveBeenCalled();
  });

  test('escalates conversation on hard trigger and appends emergency assistant draft', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(mockConversation);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue(mockLandlord);
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'escalated', urgency: 5 });
    notificationService.sendByTriggerEvent = jest.fn().mockResolvedValue({});

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'There is an active fire in the unit right now!', logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, expect.objectContaining({
      status: 'escalated',
      urgency: 5,
      risk_state: 'elevated',
      needs_human_review: true,
    }));
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      suggested: true,
      content: expect.stringContaining('I am escalating it to the property manager for immediate follow-up'),
    }));
    expect(openai.generateReply).not.toHaveBeenCalled();
  });

  test('marks soft review and still drafts AI response for non-hard trigger phrases', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(mockConversation);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue(mockLandlord);
    convRepo.countRecentAiReplies.mockResolvedValue(0);
    openai.classifyMessage.mockResolvedValue({ category: 'maintenance', urgency: 4 });
    convRepo.update.mockResolvedValue({ ...mockConversation, risk_state: 'elevated', needs_human_review: true });
    convRepo.findMessages.mockResolvedValue([]);
    openai.generateReply.mockResolvedValue({ reply: 'Let me gather a few details.', tokensUsed: 12, model: 'gpt-4o-mini' });

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'We have mold in the bathroom and need help.', logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, expect.objectContaining({
      risk_state: 'elevated',
      needs_human_review: true,
      review_reason: expect.stringContaining('soft_review_trigger:'),
    }));
    expect(openai.generateReply).toHaveBeenCalled();
  });

  test('reuses escalated conversation and still drafts when automation mode is ai_active', async () => {
    // Tenant had an escalated conversation; findActive should return it now
    const escalatedConv = { ...mockConversation, status: 'escalated', automation_mode: 'ai_active' };
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(escalatedConv); // returns escalated conv
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue(mockLandlord);
    convRepo.countRecentAiReplies.mockResolvedValue(0);
    openai.classifyMessage.mockResolvedValue({ category: 'maintenance', urgency: 2 });
    convRepo.update.mockResolvedValue({ ...escalatedConv, category: 'maintenance', urgency: 2 });
    convRepo.findMessages.mockResolvedValue([]);
    openai.generateReply.mockResolvedValue({ reply: 'Draft response', tokensUsed: 11, model: 'gpt-4o-mini' });

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    // No new conversation should be created
    expect(convRepo.create).not.toHaveBeenCalled();
    // Message appended to existing thread
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID, role: 'user',
    }));
    expect(openai.generateReply).toHaveBeenCalled();
  });

  test('suppresses AI drafting when automation mode is human_only', async () => {
    const humanOnlyConv = { ...mockConversation, status: 'escalated', automation_mode: 'human_only' };
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(humanOnlyConv);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(openai.generateReply).not.toHaveBeenCalled();
  });

  test('calls approveSuggestedReply when ai_reply_mode=auto', async () => {
    setupHappyPath({ existingConv: mockConversation, replyMode: 'auto' });
    // approveSuggestedReply needs these mocks
    convRepo.findById.mockResolvedValue(mockConversation);
    convRepo.findPendingSuggestion.mockResolvedValue(mockDraft);
    tenantRepo.findById.mockResolvedValue(mockTenantRecord);
    userRepo.findById.mockImplementation((id) => {
      if (id === LANDLORD_ID) return Promise.resolve({ ...mockLandlord, ai_reply_mode: 'auto' });
      if (id === TENANT_USER_ID) return Promise.resolve(mockTenantUser);
      return Promise.resolve(null);
    });
    notificationService.sendSmsAdhoc = jest.fn().mockResolvedValue({});
    convRepo.markSent.mockResolvedValue({ ...mockDraft, sent_at: new Date() });

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.markSent).toHaveBeenCalled();
  });

  test('does not auto-send when conversation mode is ai_assist_only', async () => {
    setupHappyPath({ existingConv: { ...mockConversation, automation_mode: 'ai_assist_only' }, replyMode: 'auto' });
    convRepo.findMessages.mockResolvedValue([]);
    openai.generateReply.mockResolvedValue({ reply: 'Draft only', tokensUsed: 8, model: 'gpt-4o-mini' });

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: MESSAGE_CONTENT, logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.markSent).not.toHaveBeenCalled();
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', suggested: true }));
  });
});

// ── approveSuggestedReply ─────────────────────────────────────────────────────

describe('approveSuggestedReply', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    convRepo.findPendingSuggestion.mockResolvedValue(mockDraft);
    userRepo.findById.mockImplementation((id) => {
      if (id === LANDLORD_ID)    return Promise.resolve(mockLandlord);
      if (id === TENANT_USER_ID) return Promise.resolve(mockTenantUser);
      return Promise.resolve(null);
    });
    tenantRepo.findById.mockResolvedValue(mockTenantRecord);
    notificationService.sendSmsAdhoc = jest.fn().mockResolvedValue({});
    convRepo.markSent.mockResolvedValue({ ...mockDraft, sent_at: new Date() });
  });

  test('marks message as sent and returns updated message', async () => {
    const result = await conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID, mockDraft.id);
    expect(convRepo.markSent).toHaveBeenCalledWith(mockDraft.id, LANDLORD_ID);
    expect(result).toMatchObject({ sent_at: expect.any(Date) });
  });

  test('throws 404 when expectedMsgId does not match the pending draft', async () => {
    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID, 'stale-id'))
      .rejects.toMatchObject({ status: 404 });
    expect(convRepo.markSent).not.toHaveBeenCalled();
  });

  test('reverts markSent and throws 503 when delivery fails', async () => {
    notificationService.sendSmsAdhoc = jest.fn().mockRejectedValue(new Error('Twilio 500'));
    convRepo.unmarkSent = jest.fn().mockResolvedValue();

    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID, mockDraft.id))
      .rejects.toMatchObject({ status: 503 });

    expect(convRepo.markSent).toHaveBeenCalled();
    expect(convRepo.unmarkSent).toHaveBeenCalledWith(mockDraft.id);
  });

  test('throws 404 when conversation not found', async () => {
    convRepo.findById.mockResolvedValue(null);
    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  test('throws 404 when no pending draft exists', async () => {
    convRepo.findPendingSuggestion.mockResolvedValue(null);
    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  test('throws 409 when markSent returns null (already approved / race condition)', async () => {
    convRepo.markSent.mockResolvedValue(null); // draft already sent
    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 409 });
    // Delivery must NOT have happened — markSent is the atomic gate
    expect(notificationService.sendSmsAdhoc).not.toHaveBeenCalled();
  });

  test('throws 404 when tenant user cannot be found', async () => {
    tenantRepo.findById.mockResolvedValue(null);
    await expect(conversationService.approveSuggestedReply(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── dismissSuggestedReply ─────────────────────────────────────────────────────

describe('dismissSuggestedReply', () => {
  test('deletes the pending suggestion', async () => {
    convRepo.findPendingSuggestion.mockResolvedValue(mockDraft);
    convRepo.deleteSuggestion.mockResolvedValue({ id: mockDraft.id });

    const result = await conversationService.dismissSuggestedReply(CONV_ID, mockDraft.id);
    expect(convRepo.deleteSuggestion).toHaveBeenCalledWith(mockDraft.id);
    expect(result).toMatchObject({ id: mockDraft.id });
  });

  test('throws 404 when no pending draft exists', async () => {
    convRepo.findPendingSuggestion.mockResolvedValue(null);
    await expect(conversationService.dismissSuggestedReply(CONV_ID, mockDraft.id))
      .rejects.toMatchObject({ status: 404 });
  });

  test('throws 404 when expectedMsgId does not match', async () => {
    convRepo.findPendingSuggestion.mockResolvedValue(mockDraft);
    await expect(conversationService.dismissSuggestedReply(CONV_ID, 'wrong-id'))
      .rejects.toMatchObject({ status: 404 });
    expect(convRepo.deleteSuggestion).not.toHaveBeenCalled();
  });
});

// ── resolveConversation ───────────────────────────────────────────────────────

describe('resolveConversation', () => {
  test('updates status to resolved and clears unread_count', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'resolved', unread_count: 0 });
    await conversationService.resolveConversation(CONV_ID);
    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { status: 'resolved', unread_count: 0 });
  });
});

// ── escalateConversation ──────────────────────────────────────────────────────

describe('escalateConversation', () => {
  beforeEach(() => {
    notificationService.sendByTriggerEvent = jest.fn().mockResolvedValue({});
  });

  test('updates status + policy fields for escalated review', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'escalated', urgency: 5, owner_id: LANDLORD_ID });
    await conversationService.escalateConversation(CONV_ID, LANDLORD_ID);
    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, expect.objectContaining({
      status: 'escalated',
      urgency: 5,
      risk_state: 'elevated',
      needs_human_review: true,
    }));
  });

  test('sends notification to landlord', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'escalated', urgency: 5, owner_id: LANDLORD_ID });
    await conversationService.escalateConversation(CONV_ID, LANDLORD_ID);
    // notification is fire-and-forget; wait for next tick
    await new Promise(setImmediate);
    expect(notificationService.sendByTriggerEvent).toHaveBeenCalledWith(expect.objectContaining({
      triggerEvent: 'conversation_escalated',
      recipientId:  LANDLORD_ID,
    }));
  });
});

// ── reopenConversation ───────────────────────────────────────────────────────

describe('reopenConversation', () => {
  test('resets status and policy flags to active defaults', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'open', risk_state: 'normal' });

    await conversationService.reopenConversation(CONV_ID);

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, {
      status: 'open',
      risk_state: 'normal',
      needs_human_review: false,
      review_reason: null,
      automation_mode: 'ai_active',
    });
  });
});

// ── setAutomationMode ────────────────────────────────────────────────────────

describe('setAutomationMode', () => {
  test('updates automation mode when valid', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, automation_mode: 'human_only' });

    const result = await conversationService.setAutomationMode(CONV_ID, 'human_only');

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { automation_mode: 'human_only' });
    expect(result).toMatchObject({ automation_mode: 'human_only' });
  });

  test('throws 400 for invalid mode', async () => {
    await expect(conversationService.setAutomationMode(CONV_ID, 'invalid_mode'))
      .rejects.toMatchObject({ status: 400 });
    expect(convRepo.update).not.toHaveBeenCalled();
  });
});

// ── getOwnerQASnapshotFromConversation ───────────────────────────────────────

describe('getOwnerQASnapshotFromConversation', () => {
  test('returns owner snapshot payload and appends trace message', async () => {
    convRepo.findById.mockResolvedValue(mockConversation);
    ownerQaService.getOwnerSnapshot.mockResolvedValue({
      intent: 'upcoming_dues',
      summary: 'Found 2 upcoming due charge(s).',
      dateContext: { type: 'window', daysAhead: 14 },
      items: [{ charge_id: 'c1' }, { charge_id: 'c2' }],
    });
    convRepo.appendMessage.mockResolvedValue({ id: 'trace-msg-id' });

    const result = await conversationService.getOwnerQASnapshotFromConversation(
      CONV_ID,
      LANDLORD_ID,
      { intent: 'upcoming_dues', daysAhead: 14, limit: 10 },
    );

    expect(ownerQaService.getOwnerSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: LANDLORD_ID,
      intent: 'upcoming_dues',
      daysAhead: 14,
      limit: 10,
    }));
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID,
      role: 'system',
      content: expect.stringContaining('Owner Q&A snapshot generated (upcoming_dues)'),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'owner_qa_snapshot_requested',
      resourceId: CONV_ID,
      userId: LANDLORD_ID,
    }));
    expect(result).toEqual(expect.objectContaining({
      conversationId: CONV_ID,
      snapshot: expect.objectContaining({ intent: 'upcoming_dues' }),
    }));
  });

  test('throws 404 when conversation is not found', async () => {
    convRepo.findById.mockResolvedValue(null);
    await expect(
      conversationService.getOwnerQASnapshotFromConversation(CONV_ID, LANDLORD_ID, { intent: 'upcoming_dues' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(ownerQaService.getOwnerSnapshot).not.toHaveBeenCalled();
  });

  test('throws 409 when conversation has no owner scope', async () => {
    convRepo.findById.mockResolvedValue({ ...mockConversation, owner_id: null });
    await expect(
      conversationService.getOwnerQASnapshotFromConversation(CONV_ID, LANDLORD_ID, { intent: 'upcoming_dues' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(ownerQaService.getOwnerSnapshot).not.toHaveBeenCalled();
  });
});

// ── resolveLandlordForTenant ──────────────────────────────────────────────────

describe('resolveLandlordForTenant', () => {
  test('looks up tenant record by user ID first, then queries leases by tenant record ID', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    leaseRepo.findAll.mockResolvedValue([{ id: 'lease-1', owner_id: LANDLORD_ID }]);

    const result = await conversationService.resolveLandlordForTenant(TENANT_USER_ID);

    expect(tenantRepo.findByUserId).toHaveBeenCalledWith(TENANT_USER_ID);
    // MUST pass tenantRecord.id (TENANT_ID), NOT the user UUID
    expect(leaseRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
    expect(result).toBe(LANDLORD_ID);
  });

  test('returns null when tenant record not found', async () => {
    tenantRepo.findByUserId.mockResolvedValue(null);
    const result = await conversationService.resolveLandlordForTenant(TENANT_USER_ID);
    expect(leaseRepo.findAll).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  test('returns null when no active lease found', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    leaseRepo.findAll.mockResolvedValue([]);
    const result = await conversationService.resolveLandlordForTenant(TENANT_USER_ID);
    expect(result).toBeNull();
  });
});

// ── supervisorOverride ────────────────────────────────────────────────────────

describe('supervisorOverride', () => {
  const ADMIN_ID = 'admin-uuid';

  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    userRepo.findById.mockImplementation((id) => {
      if (id === LANDLORD_ID)    return Promise.resolve(mockLandlord);
      if (id === TENANT_USER_ID) return Promise.resolve(mockTenantUser);
      return Promise.resolve(null);
    });
    tenantRepo.findById.mockResolvedValue(mockTenantRecord);
    notificationService.sendSmsAdhoc = jest.fn().mockResolvedValue({});
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-override' });
  });

  test('delivers message and appends with supervisor_override=true and sentAt set', async () => {
    await conversationService.supervisorOverride(CONV_ID, 'We will fix it today.', ADMIN_ID);
    expect(notificationService.sendSmsAdhoc).toHaveBeenCalled();
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      supervisorOverride: true,
      overrideBy:         ADMIN_ID,
      role:               'assistant',
      sentAt:             expect.any(Date),
    }));
  });

  test('throws 404 when conversation not found', async () => {
    convRepo.findById.mockResolvedValue(null);
    await expect(conversationService.supervisorOverride(CONV_ID, 'test', ADMIN_ID))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── sendManualReply ───────────────────────────────────────────────────────────

describe('sendManualReply', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    userRepo.findById.mockImplementation((id) => {
      if (id === LANDLORD_ID)    return Promise.resolve(mockLandlord);
      if (id === TENANT_USER_ID) return Promise.resolve(mockTenantUser);
      return Promise.resolve(null);
    });
    tenantRepo.findById.mockResolvedValue({ ...mockTenantRecord, user_id: TENANT_USER_ID });
    notificationService.sendSmsAdhoc = jest.fn().mockResolvedValue({});
    convRepo.appendMessage.mockResolvedValue({
      id: 'msg-manual', role: 'assistant', content: 'Hello tenant',
      suggested: false, sent_at: expect.any(Date),
    });
  });

  test('delivers via SMS and appends message with sentAt', async () => {
    await conversationService.sendManualReply(CONV_ID, { content: 'Hello tenant', senderId: LANDLORD_ID });

    expect(notificationService.sendSmsAdhoc).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: TENANT_USER_ID,
      body:        expect.stringContaining('Hello tenant'),
    }));
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role:       'assistant',
      content:    'Hello tenant',
      suggested:  false,
      approvedBy: LANDLORD_ID,
      sentAt:     expect.any(Date),
    }));
  });

  test('delivers via email and passes html + text', async () => {
    convRepo.findById.mockResolvedValue({ ...mockConversation, channel: 'email', thread_id: '<tenant-last-id@mail.example.com>' });
    notificationService.sendAdhoc = jest.fn().mockResolvedValue({});

    await conversationService.sendManualReply(CONV_ID, { content: 'Email reply', senderId: LANDLORD_ID });

    expect(notificationService.sendAdhoc).toHaveBeenCalledWith(expect.objectContaining({
      html: '<p>Email reply</p>',
      text: 'Email reply',
      inReplyTo: '<tenant-last-id@mail.example.com>',
    }));
  });

  test('passes messageId containing conversationId to sendAdhoc for email channel (F2 threading)', async () => {
    convRepo.findById.mockResolvedValue({ ...mockConversation, channel: 'email' });
    notificationService.sendAdhoc = jest.fn().mockResolvedValue({});

    await conversationService.sendManualReply(CONV_ID, { content: 'Email reply', senderId: LANDLORD_ID });

    const callArgs = notificationService.sendAdhoc.mock.calls[0][0];
    // messageId must encode the conversationId so the tenant's reply client threads correctly
    expect(callArgs.messageId).toMatch(new RegExp(`^<conv-${CONV_ID}-\\d+@`));
  });

  test('throws 404 when conversation not found', async () => {
    convRepo.findById.mockResolvedValue(null);
    await expect(conversationService.sendManualReply(CONV_ID, { content: 'Hi', senderId: LANDLORD_ID }))
      .rejects.toMatchObject({ status: 404 });
  });

  test('throws 404 when tenant user cannot be resolved', async () => {
    tenantRepo.findById.mockResolvedValue(null);
    await expect(conversationService.sendManualReply(CONV_ID, { content: 'Hi', senderId: LANDLORD_ID }))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── handleInboundEmail ────────────────────────────────────────────────────────

describe('handleInboundEmail', () => {
  test('delegates to _handleInbound with channel=email', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(null);
    convRepo.create.mockResolvedValue({ ...mockConversation, channel: 'email' });
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'Email message', logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.create).toHaveBeenCalledWith(expect.objectContaining({ channel: 'email' }));
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user', content: 'Email message',
    }));
  });

  test('does not call tenantRepo.findByUserId twice on email path (no landlordId)', async () => {
    // When landlordId is null, _handleInbound must resolve the landlord via leaseRepo
    // using the already-fetched tenantRecord.id — NOT by calling findByUserId again.
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    leaseRepo.findAll.mockResolvedValue([{ id: 'lease-1', owner_id: LANDLORD_ID }]);
    convRepo.findActive.mockResolvedValue(null);
    convRepo.create.mockResolvedValue({ ...mockConversation, channel: 'email' });
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: null,
      content: 'Email message', logEntryId: LOG_ENTRY_ID,
    });

    expect(tenantRepo.findByUserId).toHaveBeenCalledTimes(1);
    expect(leaseRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
  });

  test('uses provided channel when specified', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(null);
    convRepo.create.mockResolvedValue({ ...mockConversation, channel: 'email' });
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'Email message', logEntryId: LOG_ENTRY_ID,
      channel: 'email',
    });

    expect(convRepo.create).toHaveBeenCalledWith(expect.objectContaining({ channel: 'email' }));
  });

  test('stores latest inbound email message ID as thread reply anchor', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findById.mockResolvedValue({ ...mockConversation, tenant_id: TENANT_ID, channel: 'email' });
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID,
      landlordId: LANDLORD_ID,
      content: 'Following up by email',
      logEntryId: LOG_ENTRY_ID,
      channel: 'email',
      conversationId: CONV_ID,
      inboundMessageId: '<tenant-msg-id@mail.example.com>',
    });

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, {
      thread_id: '<tenant-msg-id@mail.example.com>',
    });
  });

  // ── F2 threading: directConvId ─────────────────────────────────────────────

  test('routes directly to existing conversation when valid conversationId hint is provided', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    // The found conversation belongs to this tenant — hint is trusted
    convRepo.findById.mockResolvedValue({ ...mockConversation, tenant_id: TENANT_ID });
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'Threaded reply', logEntryId: LOG_ENTRY_ID,
      conversationId: CONV_ID,
    });

    // Must use findById (direct routing), never findActive or create
    expect(convRepo.findById).toHaveBeenCalledWith(CONV_ID);
    expect(convRepo.findActive).not.toHaveBeenCalled();
    expect(convRepo.create).not.toHaveBeenCalled();
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID, role: 'user',
    }));
  });

  test('falls back to find-or-create when directConvId belongs to a different tenant (OWASP A01 security guard)', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    // Conversation belongs to a DIFFERENT tenant — hint must be discarded
    convRepo.findById.mockResolvedValue({ ...mockConversation, tenant_id: 'other-tenant-uuid' });
    convRepo.findActive.mockResolvedValue(null);
    const newConv = { ...mockConversation, id: 'new-conv-uuid' };
    convRepo.create.mockResolvedValue(newConv);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'Injection attempt', logEntryId: LOG_ENTRY_ID,
      conversationId: CONV_ID,
    });

    // Hint discarded — normal find-or-create path runs
    expect(convRepo.findActive).toHaveBeenCalled();
    // Message appended to the legitimately created conversation, not the attacker's target
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'new-conv-uuid',
    }));
  });

  test('falls back to find-or-create when directConvId is not found in DB', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findById.mockResolvedValue(null); // stale / deleted conversation
    convRepo.findActive.mockResolvedValue(mockConversation);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue({ ...mockLandlord, ai_enabled: false });

    await conversationService.handleInboundEmail({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'Reply to old thread', logEntryId: LOG_ENTRY_ID,
      conversationId: 'stale-conv-uuid',
    });

    expect(convRepo.findActive).toHaveBeenCalled();
    expect(convRepo.create).not.toHaveBeenCalled(); // findActive returned existing conv
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID,
    }));
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('markRead', () => {
  test('resets unread_count to 0 without changing status', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, unread_count: 0 });
    await conversationService.markRead(CONV_ID);
    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { unread_count: 0 });
    // must NOT set status — only reset unread counter
    expect(convRepo.update).toHaveBeenCalledTimes(1);
    expect(convRepo.update.mock.calls[0][1]).toEqual({ unread_count: 0 });
  });
});

// ── createMaintenanceRequestFromConversation ───────────────────────────────

describe('createMaintenanceRequestFromConversation', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue({
      ...mockConversation,
      category: 'maintenance',
      urgency: 4,
      maintenance_issue: 'Kitchen sink leaking',
      maintenance_onset_time: 'yesterday evening',
      maintenance_location: 'kitchen',
    });
    leaseRepo.findAll.mockResolvedValue([{ id: 'lease-1', unit_id: 'unit-uuid' }]);
    tenantRepo.findById.mockResolvedValue({ id: TENANT_ID, user_id: TENANT_USER_ID });
    maintenanceRepo.create.mockResolvedValue({ id: 'maint-uuid', unit_id: 'unit-uuid', priority: 'high' });
    convRepo.update.mockResolvedValue({ ...mockConversation, needs_human_review: true, review_reason: 'maintenance_request_created:maint-uuid' });
    convRepo.appendMessage.mockResolvedValue({ id: 'sys-msg-uuid' });
    audit.log = jest.fn();
  });

  test('creates a maintenance request and records conversation follow-up marker', async () => {
    const result = await conversationService.createMaintenanceRequestFromConversation(CONV_ID, LANDLORD_ID);

    expect(maintenanceRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'unit-uuid',
      submittedBy: TENANT_USER_ID,
      category: 'plumbing',
      priority: 'high',
      title: 'Kitchen sink leaking',
    }));
    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, {
      needs_human_review: true,
      review_reason: 'maintenance_request_created:maint-uuid',
    });
    expect(convRepo.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID,
      role: 'system',
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'maintenance_request_created_from_conversation',
      resourceId: 'maint-uuid',
    }));
    expect(result).toEqual(expect.objectContaining({
      maintenanceRequest: expect.objectContaining({ id: 'maint-uuid' }),
      conversation: expect.objectContaining({ needs_human_review: true }),
    }));
  });

  test('throws 409 when required maintenance fields are missing', async () => {
    convRepo.findById.mockResolvedValue({
      ...mockConversation,
      category: 'maintenance',
      maintenance_issue: null,
      maintenance_onset_time: 'today',
      maintenance_location: 'kitchen',
    });

    await expect(conversationService.createMaintenanceRequestFromConversation(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 409 });
    expect(maintenanceRepo.create).not.toHaveBeenCalled();
  });

  test('uses emergency priority when slot language indicates immediate hazard', async () => {
    convRepo.findById.mockResolvedValue({
      ...mockConversation,
      category: 'maintenance',
      urgency: 3,
      maintenance_issue: 'Flooding from burst pipe in bathroom',
      maintenance_onset_time: '10 minutes ago',
      maintenance_location: 'bathroom',
    });

    await conversationService.createMaintenanceRequestFromConversation(CONV_ID, LANDLORD_ID);

    expect(maintenanceRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      priority: 'emergency',
      category: 'plumbing',
    }));
  });

  test('throws 409 when conversation category is not maintenance', async () => {
    convRepo.findById.mockResolvedValue({ ...mockConversation, category: 'payment' });

    await expect(conversationService.createMaintenanceRequestFromConversation(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 409 });
    expect(maintenanceRepo.create).not.toHaveBeenCalled();
  });

  test('throws 409 when maintenance request already exists for the conversation', async () => {
    convRepo.findById.mockResolvedValue({
      ...mockConversation,
      category: 'maintenance',
      maintenance_issue: 'Kitchen sink leaking',
      maintenance_onset_time: 'yesterday',
      maintenance_location: 'kitchen',
      review_reason: 'maintenance_request_created:maint-uuid',
    });

    await expect(conversationService.createMaintenanceRequestFromConversation(CONV_ID, LANDLORD_ID))
      .rejects.toMatchObject({ status: 409 });
    expect(maintenanceRepo.create).not.toHaveBeenCalled();
  });
});
