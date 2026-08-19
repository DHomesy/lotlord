/**
 * Unit tests for src/controllers/inboxController.js
 *
 * All external dependencies are mocked — no DB, service, or auth calls.
 * Run: npm run test:unit
 */

jest.mock('../../src/dal/conversationRepository');
jest.mock('../../src/services/conversationService');
jest.mock('../../src/services/ownerQaService');
jest.mock('../../src/services/ownerAssistantService');
jest.mock('../../src/services/auditService');
jest.mock('../../src/lib/authHelpers');

const convRepo            = require('../../src/dal/conversationRepository');
const conversationService = require('../../src/services/conversationService');
const ownerQaService = require('../../src/services/ownerQaService');
const ownerAssistantService = require('../../src/services/ownerAssistantService');
const { resolveOwnerId }  = require('../../src/lib/authHelpers');

const {
  listConversations,
  getUnreadSummary,
  getOwnerQaSnapshot,
  listOwnerQaSessions,
  createOwnerQaSession,
  getOwnerQaSession,
  updateOwnerQaSession,
  deleteOwnerQaSession,
  createOwnerQaSessionSnapshot,
  getConversation,
  getConversationTrace,
  updateConversation,
  sendReply,
  approveDraft,
  dismissDraft,
  listAllConversations,
  supervisorOverride,
  supervisorUpdateConversation,
} = require('../../src/controllers/inboxController');

// ── Test fixtures ─────────────────────────────────────────────────────────────

const OWNER_ID   = 'owner-uuid';
const TENANT_ID  = 'tenant-uuid';
const CONV_ID    = 'conv-uuid';
const ADMIN_ID   = 'admin-uuid';
const USER_SUB   = 'user-sub-uuid';

const mockConversation = {
  id: CONV_ID, owner_id: OWNER_ID, tenant_id: TENANT_ID,
  channel: 'sms', status: 'open', urgency: 3, unread_count: 2,
};
const mockMessages = [
  { id: 'msg-1', role: 'user', content: 'Hello', suggested: false },
];
const mockMessage = { id: 'msg-reply', role: 'assistant', content: 'Hi there', suggested: false };

// ── Mock helpers ──────────────────────────────────────────────────────────────

/** Build a minimal req object */
function makeReq({ params = {}, body = {}, query = {}, user = {} } = {}) {
  return { params, body, query, user };
}

/** Build a minimal res spy object */
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.end    = jest.fn().mockReturnValue(res);
  return res;
}

const next = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // Default: resolveOwnerId returns OWNER_ID
  resolveOwnerId.mockReturnValue(OWNER_ID);
});

// ── listConversations ─────────────────────────────────────────────────────────

describe('listConversations', () => {
  test('returns conversations for the resolved owner', async () => {
    const convList = [mockConversation];
    convRepo.findAllByOwner.mockResolvedValue(convList);

    const req = makeReq({ query: {}, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await listConversations(req, res, next);

    expect(resolveOwnerId).toHaveBeenCalledWith(req.user);
    expect(convRepo.findAllByOwner).toHaveBeenCalledWith(OWNER_ID, expect.objectContaining({ page: 1, limit: 30 }));
    expect(res.json).toHaveBeenCalledWith(convList);
  });

  test('applies status and urgency filters from query string', async () => {
    convRepo.findAllByOwner.mockResolvedValue([]);

    const req = makeReq({ query: { status: 'escalated', urgency: '4' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await listConversations(req, res, next);

    expect(convRepo.findAllByOwner).toHaveBeenCalledWith(OWNER_ID, expect.objectContaining({
      status: 'escalated', urgency: 4,
    }));
  });

  test('passes error to next on failure', async () => {
    const boom = new Error('DB error');
    convRepo.findAllByOwner.mockRejectedValue(boom);

    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await listConversations(req, res, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

// ── getUnreadSummary ─────────────────────────────────────────────────────────

describe('getUnreadSummary', () => {
  test('returns unread aggregate for resolved owner scope', async () => {
    convRepo.getUnreadSummary.mockResolvedValue({ totalUnread: 7, threadsWithUnread: 3 });
    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await getUnreadSummary(req, res, next);

    expect(resolveOwnerId).toHaveBeenCalledWith(req.user);
    expect(convRepo.getUnreadSummary).toHaveBeenCalledWith(OWNER_ID);
    expect(res.json).toHaveBeenCalledWith({ totalUnread: 7, threadsWithUnread: 3 });
  });
});

// ── owner QA portal endpoints ────────────────────────────────────────────────

describe('owner QA portal endpoints', () => {
  test('getOwnerQaSnapshot returns 403 for non-landlord roles', async () => {
    const req = makeReq({ user: { role: 'admin', sub: ADMIN_ID }, body: { prompt: 'upcoming dues' } });
    const res = makeRes();

    await getOwnerQaSnapshot(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(ownerQaService.getOwnerSnapshot).not.toHaveBeenCalled();
  });

  test('listOwnerQaSessions returns sessions for owner', async () => {
    ownerAssistantService.listOwnerSessions.mockResolvedValue({
      sessions: [{ id: 'sess-1', title: 'Owner AI Session' }],
      pagination: { page: 1, limit: 5, total: 1, hasMore: false },
    });
    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID }, query: { limit: '5', page: '1', q: 'owner' } });
    const res = makeRes();

    await listOwnerQaSessions(req, res, next);

    expect(ownerAssistantService.listOwnerSessions).toHaveBeenCalledWith(OWNER_ID, {
      limit: '5',
      page: '1',
      search: 'owner',
    });
    expect(res.json).toHaveBeenCalledWith({
      sessions: [{ id: 'sess-1', title: 'Owner AI Session' }],
      pagination: { page: 1, limit: 5, total: 1, hasMore: false },
    });
  });

  test('createOwnerQaSession returns 201 and created session', async () => {
    ownerAssistantService.createOwnerSession.mockResolvedValue({ id: 'sess-2', title: 'Owner AI Session' });
    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID }, body: { title: 'Q&A' } });
    const res = makeRes();

    await createOwnerQaSession(req, res, next);

    expect(ownerAssistantService.createOwnerSession).toHaveBeenCalledWith(OWNER_ID, { title: 'Q&A' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ session: { id: 'sess-2', title: 'Owner AI Session' } });
  });

  test('createOwnerQaSessionSnapshot validates prompt-or-intent and persists snapshot', async () => {
    ownerAssistantService.runSessionSnapshot.mockResolvedValue({
      sessionId: 'sess-3',
      snapshot: { intent: 'upcoming_dues', items: [] },
      message: { id: 'msg-1' },
    });
    const req = makeReq({
      user: { role: 'landlord', sub: OWNER_ID },
      params: { sessionId: 'sess-3' },
      body: { prompt: 'who is past due?', limit: 5 },
    });
    const res = makeRes();

    await createOwnerQaSessionSnapshot(req, res, next);

    expect(ownerAssistantService.runSessionSnapshot).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      sessionId: 'sess-3',
      intent: undefined,
      prompt: 'who is past due?',
      daysAhead: undefined,
      limit: 5,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('getOwnerQaSession returns detail payload', async () => {
    ownerAssistantService.getOwnerSessionDetail.mockResolvedValue({
      session: { id: 'sess-4', owner_id: OWNER_ID },
      messages: [],
    });
    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID }, params: { sessionId: 'sess-4' }, query: { limit: '10' } });
    const res = makeRes();

    await getOwnerQaSession(req, res, next);

    expect(ownerAssistantService.getOwnerSessionDetail).toHaveBeenCalledWith(OWNER_ID, 'sess-4', { limit: '10', page: undefined });
    expect(res.json).toHaveBeenCalledWith({
      session: { id: 'sess-4', owner_id: OWNER_ID },
      messages: [],
    });
  });

  test('updateOwnerQaSession returns 400 when title missing', async () => {
    const req = makeReq({
      user: { role: 'landlord', sub: OWNER_ID },
      params: { sessionId: 'sess-4' },
      body: { title: '   ' },
    });
    const res = makeRes();

    await updateOwnerQaSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(ownerAssistantService.renameOwnerSession).not.toHaveBeenCalled();
  });

  test('updateOwnerQaSession renames and returns session', async () => {
    ownerAssistantService.renameOwnerSession.mockResolvedValue({ id: 'sess-4', title: 'Portfolio Weekly' });
    const req = makeReq({
      user: { role: 'landlord', sub: OWNER_ID },
      params: { sessionId: 'sess-4' },
      body: { title: 'Portfolio Weekly' },
    });
    const res = makeRes();

    await updateOwnerQaSession(req, res, next);

    expect(ownerAssistantService.renameOwnerSession).toHaveBeenCalledWith(OWNER_ID, 'sess-4', { title: 'Portfolio Weekly' });
    expect(res.json).toHaveBeenCalledWith({ session: { id: 'sess-4', title: 'Portfolio Weekly' } });
  });

  test('deleteOwnerQaSession returns 204 when deleted', async () => {
    ownerAssistantService.removeOwnerSession.mockResolvedValue({ id: 'sess-4' });
    const req = makeReq({ user: { role: 'landlord', sub: OWNER_ID }, params: { sessionId: 'sess-4' } });
    const res = makeRes();

    await deleteOwnerQaSession(req, res, next);

    expect(ownerAssistantService.removeOwnerSession).toHaveBeenCalledWith(OWNER_ID, 'sess-4');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });
});

// ── getConversation ───────────────────────────────────────────────────────────

describe('getConversation', () => {
  test('returns conversation and messages for the owner', async () => {
    convRepo.findById.mockResolvedValue(mockConversation);
    convRepo.findMessages.mockResolvedValue(mockMessages);

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await getConversation(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ conversation: mockConversation, messages: mockMessages });
  });

  test('returns 404 when conversation does not exist', async () => {
    convRepo.findById.mockResolvedValue(null);

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await getConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('returns 403 when non-owner landlord requests conversation', async () => {
    resolveOwnerId.mockReturnValue('other-owner-uuid');
    convRepo.findById.mockResolvedValue(mockConversation); // owner_id = OWNER_ID

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'landlord', sub: 'other-owner-uuid' } });
    const res = makeRes();

    await getConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Access denied' }));
  });

  test('admin bypasses ownership check', async () => {
    convRepo.findById.mockResolvedValue(mockConversation);
    convRepo.findMessages.mockResolvedValue(mockMessages);

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await getConversation(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ conversation: mockConversation }));
  });
});

// ── getConversationTrace ─────────────────────────────────────────────────────

describe('getConversationTrace', () => {
  test('returns trace payload for owner', async () => {
    convRepo.findById.mockResolvedValue(mockConversation);
    convRepo.getTraceSummary.mockResolvedValue({
      channel: 'sms',
      status: 'open',
      risk_state: 'elevated',
      automation_mode: 'ai_assist_only',
      needs_human_review: true,
      review_reason: 'escalated_by:owner-uuid',
      unread_count: 2,
      latest_inbound_at: '2026-08-09T00:00:00.000Z',
      latest_outbound_at: null,
      pending_ai_drafts: 1,
      inbound_message_count: 4,
      received_log_count: 4,
      failed_log_count: 0,
      latest_inbound_preview: 'hello',
      tenant_open_unmatched_count: 0,
    });

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await getConversationTrace(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID,
      channel: 'sms',
      riskState: 'elevated',
      automationMode: 'ai_assist_only',
      needsHumanReview: true,
      checkpoints: expect.objectContaining({
        receivedWebhook: true,
        routedToConversation: true,
        queuedUnmatched: false,
      }),
    }));
  });

  test('returns 403 when non-owner requests trace', async () => {
    resolveOwnerId.mockReturnValue('other-owner-uuid');
    convRepo.findById.mockResolvedValue(mockConversation);

    const req = makeReq({ params: { id: CONV_ID }, user: { role: 'landlord', sub: 'other-owner-uuid' } });
    const res = makeRes();

    await getConversationTrace(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── updateConversation ────────────────────────────────────────────────────────

describe('updateConversation', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
  });

  test('action=resolve delegates to conversationService.resolveConversation', async () => {
    const resolved = { ...mockConversation, status: 'resolved' };
    conversationService.resolveConversation.mockResolvedValue(resolved);

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'resolve' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.resolveConversation).toHaveBeenCalledWith(CONV_ID);
    expect(res.json).toHaveBeenCalledWith(resolved);
  });

  test('action=escalate delegates to conversationService.escalateConversation', async () => {
    const escalated = { ...mockConversation, status: 'escalated', urgency: 5 };
    conversationService.escalateConversation.mockResolvedValue(escalated);

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'escalate' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.escalateConversation).toHaveBeenCalledWith(CONV_ID, req.user.sub);
    expect(res.json).toHaveBeenCalledWith(escalated);
  });

  test('action=mark_read delegates to conversationService.markRead', async () => {
    const read = { ...mockConversation, unread_count: 0 };
    conversationService.markRead.mockResolvedValue(read);

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'mark_read' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.markRead).toHaveBeenCalledWith(CONV_ID);
    expect(res.json).toHaveBeenCalledWith(read);
  });

  test('action=set_mode delegates to conversationService.setAutomationMode', async () => {
    const updated = { ...mockConversation, automation_mode: 'human_only' };
    conversationService.setAutomationMode.mockResolvedValue(updated);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'set_mode', mode: 'human_only' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.setAutomationMode).toHaveBeenCalledWith(CONV_ID, 'human_only');
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('action=set_mode returns 400 for invalid mode', async () => {
    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'set_mode', mode: 'bad_mode' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(conversationService.setAutomationMode).not.toHaveBeenCalled();
  });

  test('action=create_maintenance_request delegates to service and returns 201', async () => {
    const payload = {
      conversation: { ...mockConversation, needs_human_review: true },
      maintenanceRequest: { id: 'maint-uuid' },
    };
    conversationService.createMaintenanceRequestFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'create_maintenance_request' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.createMaintenanceRequestFromConversation).toHaveBeenCalledWith(CONV_ID, OWNER_ID);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('action=owner_qa_snapshot delegates to service and returns snapshot payload', async () => {
    const payload = {
      conversationId: CONV_ID,
      snapshot: {
        intent: 'upcoming_dues',
        summary: 'Found 1 upcoming due charge(s).',
        items: [{ charge_id: 'charge-1' }],
      },
    };
    conversationService.getOwnerQASnapshotFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', intent: 'upcoming_dues', daysAhead: 14, limit: 5 },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.getOwnerQASnapshotFromConversation).toHaveBeenCalledWith(CONV_ID, OWNER_ID, {
      intent: 'upcoming_dues',
      daysAhead: 14,
      limit: 5,
    });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('action=owner_qa_snapshot accepts aging_summary intent', async () => {
    const payload = {
      conversationId: CONV_ID,
      snapshot: {
        intent: 'aging_summary',
        summary: 'Aging summary includes 2 overdue charge(s).',
      },
    };
    conversationService.getOwnerQASnapshotFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', intent: 'aging_summary' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.getOwnerQASnapshotFromConversation).toHaveBeenCalledWith(CONV_ID, OWNER_ID, {
      intent: 'aging_summary',
      prompt: undefined,
      daysAhead: undefined,
      limit: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('action=owner_qa_snapshot returns 400 for invalid intent', async () => {
    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', intent: 'not_real' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(conversationService.getOwnerQASnapshotFromConversation).not.toHaveBeenCalled();
  });

  test('action=owner_qa_snapshot accepts prompt-only payload and delegates', async () => {
    const payload = {
      conversationId: CONV_ID,
      snapshot: { intent: 'upcoming_dues', summary: 'Found 0 upcoming due charge(s).' },
    };
    conversationService.getOwnerQASnapshotFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', prompt: 'Show me upcoming dues for the next month' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(conversationService.getOwnerQASnapshotFromConversation).toHaveBeenCalledWith(CONV_ID, OWNER_ID, {
      intent: undefined,
      prompt: 'Show me upcoming dues for the next month',
      daysAhead: undefined,
      limit: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('direct field update succeeds with valid values', async () => {
    const updated = { ...mockConversation, status: 'resolved', urgency: 2, category: 'maintenance' };
    convRepo.update.mockResolvedValue(updated);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { status: 'resolved', urgency: 2, category: 'maintenance' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, { status: 'resolved', urgency: 2, category: 'maintenance' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('returns 400 for invalid status', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: { status: 'INVALID' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('status') }));
    expect(convRepo.update).not.toHaveBeenCalled();
  });

  test('returns 400 for urgency out of range', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: { urgency: 9 }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('urgency') }));
  });

  test('returns 400 for invalid category', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: { category: 'plumbing' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('category') }));
  });

  test('returns 400 for empty body with no action and no fields', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: {}, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(convRepo.update).not.toHaveBeenCalled();
  });

  test('returns 403 for non-owner', async () => {
    resolveOwnerId.mockReturnValue('other-uuid');

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'resolve' }, user: { role: 'landlord', sub: 'other-uuid' } });
    const res = makeRes();

    await updateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── sendReply ─────────────────────────────────────────────────────────────────

describe('sendReply', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    conversationService.sendManualReply.mockResolvedValue(mockMessage);
  });

  test('sends reply and returns 201 with the message', async () => {
    const req = makeReq({
      params: { id: CONV_ID }, body: { content: 'Hello tenant' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await sendReply(req, res, next);

    expect(conversationService.sendManualReply).toHaveBeenCalledWith(CONV_ID, {
      content: 'Hello tenant', senderId: OWNER_ID,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockMessage);
  });

  test('returns 400 when content is missing', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: {}, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await sendReply(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(conversationService.sendManualReply).not.toHaveBeenCalled();
  });

  test('returns 400 when content is blank whitespace', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: { content: '   ' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await sendReply(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 when content exceeds 5000 characters', async () => {
    const req = makeReq({
      params: { id: CONV_ID }, body: { content: 'x'.repeat(5001) },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await sendReply(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('5000') }));
    expect(conversationService.sendManualReply).not.toHaveBeenCalled();
  });

  test('returns 403 for non-owner', async () => {
    resolveOwnerId.mockReturnValue('other-uuid');
    const req = makeReq({
      params: { id: CONV_ID }, body: { content: 'Hi' },
      user: { role: 'landlord', sub: 'other-uuid' },
    });
    const res = makeRes();

    await sendReply(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── approveDraft ──────────────────────────────────────────────────────────────

describe('approveDraft', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    conversationService.approveSuggestedReply.mockResolvedValue(mockMessage);
  });

  test('approves draft and returns message', async () => {
    const req = makeReq({
      params: { id: CONV_ID, msgId: 'msg-1' },
      user: { role: 'landlord', sub: OWNER_ID },
    });
    const res = makeRes();

    await approveDraft(req, res, next);

    expect(conversationService.approveSuggestedReply).toHaveBeenCalledWith(CONV_ID, OWNER_ID, 'msg-1');
    expect(res.json).toHaveBeenCalledWith(mockMessage);
  });

  test('returns 404 when conversation not found', async () => {
    convRepo.findById.mockResolvedValue(null);

    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await approveDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(conversationService.approveSuggestedReply).not.toHaveBeenCalled();
  });

  test('returns 403 for non-owner', async () => {
    resolveOwnerId.mockReturnValue('other-uuid');

    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: 'other-uuid' } });
    const res = makeRes();

    await approveDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('passes service errors to next (e.g. no pending draft — 404)', async () => {
    const serviceErr = Object.assign(new Error('No pending draft'), { status: 404 });
    conversationService.approveSuggestedReply.mockRejectedValue(serviceErr);

    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await approveDraft(req, res, next);

    expect(next).toHaveBeenCalledWith(serviceErr);
  });

  test('passes 409 to next when draft was already approved (race condition)', async () => {
    const conflictErr = Object.assign(new Error('Draft already approved'), { status: 409 });
    conversationService.approveSuggestedReply.mockRejectedValue(conflictErr);

    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await approveDraft(req, res, next);

    expect(next).toHaveBeenCalledWith(conflictErr);
  });
});

// ── dismissDraft ──────────────────────────────────────────────────────────────

describe('dismissDraft', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
    conversationService.dismissSuggestedReply.mockResolvedValue({ id: 'msg-1' });
  });

  test('dismisses draft and returns 204', async () => {
    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: OWNER_ID } });
    const res = makeRes();

    await dismissDraft(req, res, next);

    expect(conversationService.dismissSuggestedReply).toHaveBeenCalledWith(CONV_ID, 'msg-1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  test('returns 403 for non-owner', async () => {
    resolveOwnerId.mockReturnValue('other-uuid');

    const req = makeReq({ params: { id: CONV_ID, msgId: 'msg-1' }, user: { role: 'landlord', sub: 'other-uuid' } });
    const res = makeRes();

    await dismissDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(conversationService.dismissSuggestedReply).not.toHaveBeenCalled();
  });
});

// ── listAllConversations (supervisor) ─────────────────────────────────────────

describe('listAllConversations', () => {
  test('returns conversations across all landlords for admin', async () => {
    const allConvs = [mockConversation, { ...mockConversation, id: 'conv-2', owner_id: 'other-owner' }];
    convRepo.findAllForSupervisor.mockResolvedValue(allConvs);

    const req = makeReq({ query: {}, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await listAllConversations(req, res, next);

    expect(convRepo.findAllForSupervisor).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 30 }));
    expect(res.json).toHaveBeenCalledWith(allConvs);
  });

  test('passes filters to repository', async () => {
    convRepo.findAllForSupervisor.mockResolvedValue([]);

    const req = makeReq({ query: { status: 'escalated', ownerId: OWNER_ID, urgency: '5' }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await listAllConversations(req, res, next);

    expect(convRepo.findAllForSupervisor).toHaveBeenCalledWith(expect.objectContaining({
      status: 'escalated', ownerId: OWNER_ID, urgency: 5,
    }));
  });
});

// ── supervisorOverride ────────────────────────────────────────────────────────

describe('supervisorOverride', () => {
  beforeEach(() => {
    conversationService.supervisorOverride.mockResolvedValue(mockMessage);
  });

  test('calls service and returns 201 with message', async () => {
    const req = makeReq({
      params: { id: CONV_ID }, body: { content: 'Admin override message' },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorOverride(req, res, next);

    expect(conversationService.supervisorOverride).toHaveBeenCalledWith(CONV_ID, 'Admin override message', ADMIN_ID);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockMessage);
  });

  test('returns 400 when content is missing', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: {}, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await supervisorOverride(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(conversationService.supervisorOverride).not.toHaveBeenCalled();
  });

  test('returns 400 when content exceeds 5000 characters', async () => {
    const req = makeReq({
      params: { id: CONV_ID }, body: { content: 'y'.repeat(5001) },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorOverride(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('5000') }));
  });
});

// ── supervisorUpdateConversation ──────────────────────────────────────────────

describe('supervisorUpdateConversation', () => {
  beforeEach(() => {
    convRepo.findById.mockResolvedValue(mockConversation);
  });

  test('action=resolve delegates to service', async () => {
    const resolved = { ...mockConversation, status: 'resolved' };
    conversationService.resolveConversation.mockResolvedValue(resolved);

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'resolve' }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(conversationService.resolveConversation).toHaveBeenCalledWith(CONV_ID);
    expect(res.json).toHaveBeenCalledWith(resolved);
  });

  test('action=set_mode delegates to service for supervisor', async () => {
    const updated = { ...mockConversation, automation_mode: 'ai_assist_only' };
    conversationService.setAutomationMode.mockResolvedValue(updated);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'set_mode', mode: 'ai_assist_only' },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(conversationService.setAutomationMode).toHaveBeenCalledWith(CONV_ID, 'ai_assist_only');
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('action=create_maintenance_request delegates to service for supervisor and returns 201', async () => {
    const payload = {
      conversation: { ...mockConversation, needs_human_review: true },
      maintenanceRequest: { id: 'maint-uuid' },
    };
    conversationService.createMaintenanceRequestFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'create_maintenance_request' },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(conversationService.createMaintenanceRequestFromConversation).toHaveBeenCalledWith(CONV_ID, ADMIN_ID);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('action=owner_qa_snapshot delegates to service for supervisor', async () => {
    const payload = {
      conversationId: CONV_ID,
      snapshot: {
        intent: 'past_due_tenants',
        summary: 'Found 2 tenant(s) with past-due balances.',
        items: [],
      },
    };
    conversationService.getOwnerQASnapshotFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', intent: 'past_due_tenants', limit: 10 },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(conversationService.getOwnerQASnapshotFromConversation).toHaveBeenCalledWith(CONV_ID, ADMIN_ID, {
      intent: 'past_due_tenants',
      daysAhead: undefined,
      limit: 10,
    });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('action=owner_qa_snapshot accepts prompt-only payload for supervisor', async () => {
    const payload = {
      conversationId: CONV_ID,
      snapshot: {
        intent: 'maintenance_overview',
        summary: 'There are 3 maintenance request(s) in scope.',
        items: [],
      },
    };
    conversationService.getOwnerQASnapshotFromConversation.mockResolvedValue(payload);

    const req = makeReq({
      params: { id: CONV_ID },
      body: { action: 'owner_qa_snapshot', prompt: 'How many maintenance tickets are completed?' },
      user: { role: 'admin', sub: ADMIN_ID },
    });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(conversationService.getOwnerQASnapshotFromConversation).toHaveBeenCalledWith(CONV_ID, ADMIN_ID, {
      intent: undefined,
      prompt: 'How many maintenance tickets are completed?',
      daysAhead: undefined,
      limit: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('direct field update with valid values succeeds', async () => {
    const updated = { ...mockConversation, urgency: 5 };
    convRepo.update.mockResolvedValue(updated);

    const req = makeReq({ params: { id: CONV_ID }, body: { urgency: 5 }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(convRepo.update).toHaveBeenCalledWith(CONV_ID, expect.objectContaining({ urgency: 5 }));
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('returns 400 for invalid status in direct update', async () => {
    const req = makeReq({ params: { id: CONV_ID }, body: { status: 'pending' }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(convRepo.update).not.toHaveBeenCalled();
  });

  test('returns 404 when conversation not found', async () => {
    convRepo.findById.mockResolvedValue(null);

    const req = makeReq({ params: { id: CONV_ID }, body: { action: 'resolve' }, user: { role: 'admin', sub: ADMIN_ID } });
    const res = makeRes();

    await supervisorUpdateConversation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
