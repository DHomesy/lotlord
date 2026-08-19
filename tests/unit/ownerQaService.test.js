jest.mock('../../src/dal/ownerQaRepository');
jest.mock('../../src/dal/ownerQaQualityRepository');

const ownerQaRepo = require('../../src/dal/ownerQaRepository');
const ownerQaQualityRepo = require('../../src/dal/ownerQaQualityRepository');
const ownerQaService = require('../../src/services/ownerQaService');

describe('ownerQaService.getOwnerSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns upcoming dues snapshot with deterministic summary and date context', async () => {
    ownerQaRepo.getUpcomingDues.mockResolvedValue([
      { charge_id: 'c1', amount_due: '125.50' },
      { charge_id: 'c2', amount_due: '74.50' },
    ]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      intent: 'upcoming_dues',
      daysAhead: 10,
      limit: 5,
    });

    expect(ownerQaRepo.getUpcomingDues).toHaveBeenCalledWith({ ownerId: 'owner-1', daysAhead: 10, limit: 5 });
    expect(result.intent).toBe('upcoming_dues');
    expect(result.summary).toBe('Found 2 upcoming due charge(s) in the next 10 day(s), totaling $200.00.');
    expect(result.dateContext).toEqual(expect.objectContaining({ type: 'window', daysAhead: 10 }));
    expect(result.quality.policy).toEqual(expect.objectContaining({
      threshold: 0.7,
      score: 0.9,
      metThreshold: true,
      fallbackRecommended: false,
    }));
    expect(result.protocol).toEqual(expect.objectContaining({
      action: 'owner_qa_snapshot',
      intent: 'upcoming_dues',
      execution: 'deterministic_query_broker',
      fallback: expect.objectContaining({ required: false }),
    }));
    expect(ownerQaQualityRepo.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'owner-1',
      intent: 'upcoming_dues',
      confidence: 'high',
      fallbackRecommended: false,
    }));
  });

  test('returns past due tenant snapshot', async () => {
    ownerQaRepo.getPastDueTenants.mockResolvedValue([
      { tenant_user_id: 'u1', overdue_amount: '500.00' },
    ]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      intent: 'past_due_tenants',
      limit: 10,
    });

    expect(ownerQaRepo.getPastDueTenants).toHaveBeenCalledWith({ ownerId: 'owner-1', limit: 10 });
    expect(result.intent).toBe('past_due_tenants');
    expect(result.summary).toBe('Found 1 tenant(s) with past-due balances totaling $500.00.');
    expect(result.dateContext).toEqual(expect.objectContaining({ type: 'as_of' }));
  });

  test('returns tenant balance snapshot', async () => {
    ownerQaRepo.getTenantBalances.mockResolvedValue([
      { tenant_user_id: 'u1', balance: '100.00' },
      { tenant_user_id: 'u2', balance: '25.00' },
    ]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      intent: 'balance_by_tenant',
    });

    expect(ownerQaRepo.getTenantBalances).toHaveBeenCalledWith({ ownerId: 'owner-1', limit: 10 });
    expect(result.summary).toBe('Found 2 tenant balance row(s) with total outstanding balance $125.00.');
  });

  test('returns aging summary snapshot', async () => {
    ownerQaRepo.getAgingSummary.mockResolvedValue([
      { bucket: '1-30', charge_count: 2, total_amount: '210.00' },
      { bucket: '31-60', charge_count: 1, total_amount: '90.00' },
    ]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      intent: 'aging_summary',
    });

    expect(ownerQaRepo.getAgingSummary).toHaveBeenCalledWith({ ownerId: 'owner-1' });
    expect(result.intent).toBe('aging_summary');
    expect(result.summary).toBe('Aging summary includes 3 overdue charge(s) totaling $300.00 across 2 bucket(s).');
    expect(result.dateContext).toEqual(expect.objectContaining({ type: 'as_of' }));
  });

  test('returns maintenance overview snapshot', async () => {
    ownerQaRepo.getMaintenanceOverview.mockResolvedValue({
      summary: [
        { status: 'open', priority: 'high', count: 2 },
        { status: 'in_progress', priority: 'medium', count: 1 },
        { status: 'completed', priority: 'low', count: 4 },
      ],
      recent: [{ id: 'm1' }],
    });

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      intent: 'maintenance_overview',
      limit: 7,
    });

    expect(ownerQaRepo.getMaintenanceOverview).toHaveBeenCalledWith({ ownerId: 'owner-1', limit: 7 });
    expect(result.summary).toBe('There are 7 maintenance request(s) in scope, including 4 completed.');
    expect(result.breakdown).toHaveLength(3);
    expect(result.items).toHaveLength(1);
  });

  test('infers intent from prompt and defaults upcoming dues window to 30 days', async () => {
    ownerQaRepo.getUpcomingDues.mockResolvedValue([]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      prompt: 'What charges are coming due soon?',
    });

    expect(ownerQaRepo.getUpcomingDues).toHaveBeenCalledWith({ ownerId: 'owner-1', daysAhead: 30, limit: 10 });
    expect(result.intent).toBe('upcoming_dues');
    expect(result.dateContext).toEqual(expect.objectContaining({ daysAhead: 30 }));
    expect(result.quality.policy).toEqual(expect.objectContaining({
      metThreshold: false,
      fallbackRecommended: true,
      fallbackRoute: 'human_review',
      fallbackReason: 'confidence_below_threshold',
    }));
    expect(result.protocol).toEqual(expect.objectContaining({
      action: 'owner_qa_snapshot',
      fallback: expect.objectContaining({
        required: true,
        route: 'human_review',
        reason: 'confidence_below_threshold',
      }),
    }));
  });

  test('infers aging summary intent from prompt', async () => {
    ownerQaRepo.getAgingSummary.mockResolvedValue([]);

    const result = await ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      prompt: 'Show an aging summary by overdue bucket',
    });

    expect(ownerQaRepo.getAgingSummary).toHaveBeenCalledWith({ ownerId: 'owner-1' });
    expect(result.intent).toBe('aging_summary');
  });

  test('throws 400 for unsupported intent', async () => {
    await expect(ownerQaService.getOwnerSnapshot({ ownerId: 'owner-1', intent: 'unknown_intent' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('throws 400 when ownerId is missing', async () => {
    await expect(ownerQaService.getOwnerSnapshot({ intent: 'upcoming_dues' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('throws 400 when prompt exceeds max length', async () => {
    await expect(ownerQaService.getOwnerSnapshot({
      ownerId: 'owner-1',
      prompt: 'x'.repeat(2001),
    })).rejects.toMatchObject({ status: 400 });
  });
});
