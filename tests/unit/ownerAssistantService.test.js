jest.mock('../../src/services/ownerQaService');
jest.mock('../../src/dal/ownerAssistantRepository');
jest.mock('../../src/services/auditService');

const ownerQaService = require('../../src/services/ownerQaService');
const ownerAssistantRepo = require('../../src/dal/ownerAssistantRepository');
const ownerAssistantService = require('../../src/services/ownerAssistantService');

describe('ownerAssistantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('runSessionSnapshot attaches context snapshot and persists enriched payload', async () => {
    ownerAssistantRepo.findSessionById.mockResolvedValue({
      id: 'sess-1',
      owner_id: 'owner-1',
      rolling_summary: 'Recent summary line',
      last_intent: 'past_due_tenants',
      message_count: 3,
    });
    ownerAssistantRepo.getSessionWithMessages.mockResolvedValue({
      messages: [
        { intent: 'past_due_tenants', prompt: 'who is overdue' },
        { intent: 'aging_summary', prompt: 'show aging' },
      ],
    });
    ownerQaService.getOwnerSnapshot.mockResolvedValue({
      intent: 'aging_summary',
      summary: 'Aging summary includes 2 charges.',
      items: [{ bucket: '1-30', charge_count: 2, total_amount: '120.00' }],
      protocol: {
        action: 'owner_qa_snapshot',
        fallback: { required: false, route: null, reason: null },
      },
      quality: {
        confidence: 'high',
        rationale: 'deterministic owner-scoped query returned direct records',
        policy: { fallbackRecommended: false, fallbackRoute: null },
      },
    });
    ownerAssistantRepo.appendSnapshot.mockResolvedValue({ id: 'msg-1' });

    const result = await ownerAssistantService.runSessionSnapshot({
      ownerId: 'owner-1',
      sessionId: 'sess-1',
      prompt: 'Show aging summary',
    });

    expect(ownerAssistantRepo.appendSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sess-1',
      ownerId: 'owner-1',
      prompt: 'Show aging summary',
      snapshot: expect.objectContaining({
        intent: 'aging_summary',
        contextSnapshot: expect.objectContaining({
          mode: 'rolling_summary_plus_recent_turns',
          lastIntent: 'past_due_tenants',
          recentPrompt: 'who is overdue',
        }),
      }),
    }));

    expect(result.snapshot.contextSnapshot.mode).toBe('rolling_summary_plus_recent_turns');
    expect(result.message).toEqual({ id: 'msg-1' });
  });

  test('runSessionSnapshot returns 404 when owner does not own session', async () => {
    ownerAssistantRepo.findSessionById.mockResolvedValue({ id: 'sess-1', owner_id: 'other-owner' });

    await expect(
      ownerAssistantService.runSessionSnapshot({ ownerId: 'owner-1', sessionId: 'sess-1', prompt: 'test' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
