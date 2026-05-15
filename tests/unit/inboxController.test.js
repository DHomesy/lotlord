/**
 * Unit tests for src/controllers/inboxController.js
 *
 * All external dependencies are mocked — no DB, service, or auth calls.
 * Run: npm run test:unit
 */

jest.mock('../../src/dal/conversationRepository');
jest.mock('../../src/services/conversationService');
jest.mock('../../src/lib/authHelpers');

const convRepo            = require('../../src/dal/conversationRepository');
const conversationService = require('../../src/services/conversationService');
const { resolveOwnerId }  = require('../../src/lib/authHelpers');

const {
  listConversations,
  getConversation,
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
