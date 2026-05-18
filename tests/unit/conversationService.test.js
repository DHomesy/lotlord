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
jest.mock('../../src/services/notificationService');
jest.mock('../../src/integrations/openai');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const convRepo           = require('../../src/dal/conversationRepository');
const userRepo           = require('../../src/dal/userRepository');
const tenantRepo         = require('../../src/dal/tenantRepository');
const leaseRepo          = require('../../src/dal/leaseRepository');
const ledgerRepo         = require('../../src/dal/ledgerRepository');
const notificationService = require('../../src/services/notificationService');
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
  channel: 'sms', status: 'open', urgency: 3,
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

  test('escalates conversation on trigger word', async () => {
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(mockConversation);
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();
    userRepo.findById.mockResolvedValue(mockLandlord);
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'escalated', urgency: 5 });
    notificationService.sendByTriggerEvent = jest.fn().mockResolvedValue({});

    await conversationService.handleInboundSms({
      tenantUserId: TENANT_USER_ID, landlordId: LANDLORD_ID,
      content: 'I am going to sue you!', logEntryId: LOG_ENTRY_ID,
    });

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { status: 'escalated', urgency: 5 });
    expect(openai.generateReply).not.toHaveBeenCalled();
  });

  test('appends message to existing escalated conversation instead of creating a new thread', async () => {
    // Tenant had an escalated conversation; findActive should return it now
    const escalatedConv = { ...mockConversation, status: 'escalated' };
    tenantRepo.findByUserId.mockResolvedValue(mockTenantRecord);
    convRepo.findActive.mockResolvedValue(escalatedConv); // returns escalated conv
    convRepo.appendMessage.mockResolvedValue({ id: 'msg-1' });
    convRepo.touchOnInbound.mockResolvedValue();

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
    // AI skipped because conv is escalated
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

  test('updates status to escalated with urgency 5', async () => {
    convRepo.update.mockResolvedValue({ ...mockConversation, status: 'escalated', urgency: 5, owner_id: LANDLORD_ID });
    await conversationService.escalateConversation(CONV_ID, LANDLORD_ID);
    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { status: 'escalated', urgency: 5 });
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
      body:        'Hello tenant',
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
    convRepo.findById.mockResolvedValue({ ...mockConversation, channel: 'email' });
    notificationService.sendAdhoc = jest.fn().mockResolvedValue({});

    await conversationService.sendManualReply(CONV_ID, { content: 'Email reply', senderId: LANDLORD_ID });

    expect(notificationService.sendAdhoc).toHaveBeenCalledWith(expect.objectContaining({
      html: '<p>Email reply</p>',
      text: 'Email reply',
    }));
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
