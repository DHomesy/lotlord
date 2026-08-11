describe('aiPromptAssemblyService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function loadServiceWithEnv({ tenantBudget = '1800', ownerBudget = '2200', maxTurns = '20' } = {}) {
    process.env.AI_PROMPT_BUDGET_TENANT_TOKENS = tenantBudget;
    process.env.AI_PROMPT_BUDGET_OWNER_QA_TOKENS = ownerBudget;
    process.env.AI_PROMPT_MAX_RECENT_TURNS = maxTurns;
    return require('../../src/services/aiPromptAssemblyService');
  }

  test('buildPromptEnvelope includes policy sections in deterministic order', async () => {
    const svc = loadServiceWithEnv();

    const result = await svc.buildPromptEnvelope({
      policyContext: 'Lease context here',
      history: [{ role: 'user', content: 'Old message' }],
      newMessage: 'Latest message',
    });

    expect(result.systemContext).toContain('D.1 Prompt Policy:');
    expect(result.systemContext).toContain('Tenant profile context:\nLease context here');
    expect(result.memory.structuredFactsPresent).toBe(false);
    expect(result.memory.rollingSummaryPresent).toBe(false);
  });

  test('selects recent turns under max turn budget', async () => {
    const svc = loadServiceWithEnv({ maxTurns: '2' });

    const history = [
      { role: 'user', content: 'm1' },
      { role: 'assistant', content: 'm2' },
      { role: 'user', content: 'm3' },
      { role: 'assistant', content: 'm4' },
    ];

    const result = await svc.buildPromptEnvelope({
      history,
      newMessage: 'latest',
    });

    expect(result.history).toHaveLength(2);
    expect(result.history[0].content).toBe('m3');
    expect(result.history[1].content).toBe('m4');
  });

  test('truncates an oversized latest history message when it exceeds token budget', () => {
    const svc = loadServiceWithEnv();
    const oversized = 'x'.repeat(2000);

    const selected = svc._private.selectRecentHistoryWithinBudget(
      [{ role: 'user', content: oversized }],
      { tokenBudget: 100, maxRecentTurns: 5 },
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].content.length).toBeLessThanOrEqual(400);
  });

  test('uses owner_q&a budget when workflow type is owner_qa', async () => {
    const svc = loadServiceWithEnv({ tenantBudget: '1200', ownerBudget: '2600' });

    const result = await svc.buildPromptEnvelope({
      workflowType: svc.WORKFLOW_TYPES.OWNER_QA,
      history: [{ role: 'user', content: 'hello' }],
      newMessage: 'question',
    });

    expect(result.budget.totalInputTokens).toBe(2600);
  });
});
