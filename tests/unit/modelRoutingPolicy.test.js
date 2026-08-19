const { resolveModel, POLICY_VERSION } = require('../../src/services/modelRoutingPolicy');

describe('modelRoutingPolicy', () => {
  test('uses classification model for classification operation', () => {
    const route = resolveModel({ operation: 'classification', messageLength: 500 });
    expect(route).toEqual(expect.objectContaining({
      model: expect.any(String),
      reason: 'classification_default',
      policyVersion: POLICY_VERSION,
    }));
  });

  test('routes critical risk generation to high risk model', () => {
    const route = resolveModel({ operation: 'generation', riskState: 'critical' });
    expect(route.reason).toBe('critical_risk');
    expect(route.model).toBeTruthy();
  });

  test('routes elevated/review generation to high risk model', () => {
    const route = resolveModel({ operation: 'generation', riskState: 'elevated', needsHumanReview: true });
    expect(route.reason).toBe('elevated_or_review');
  });

  test('routes complex generation to high risk model', () => {
    const route = resolveModel({ operation: 'generation', messageLength: 3000, historySize: 5 });
    expect(route.reason).toBe('complexity_signal');
  });

  test('routes normal generation to default model', () => {
    const route = resolveModel({ operation: 'generation', riskState: 'normal', messageLength: 120, historySize: 3 });
    expect(route.reason).toBe('default');
  });
});
