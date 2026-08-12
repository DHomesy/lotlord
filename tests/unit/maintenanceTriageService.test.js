const triage = require('../../src/services/maintenanceTriageService');

describe('maintenanceTriageService', () => {
  test('extracts all required maintenance fields from combined history and new message', () => {
    const slots = triage.deriveMaintenanceSlots({
      history: [
        { content: 'My kitchen sink is leaking.' },
        { content: 'It started yesterday evening.' },
      ],
      newMessage: 'The issue is in the kitchen near the dishwasher.',
    });

    expect(slots.issue).toBeTruthy();
    expect(slots.onset_time).toBeTruthy();
    expect(slots.location).toBeTruthy();
  });

  test('returns missing fields list when required slots are not present', () => {
    const slots = triage.deriveMaintenanceSlots({
      history: [{ content: 'Need help please.' }],
      newMessage: 'Something is wrong.',
    });

    const missing = triage.getMissingFields(slots);

    expect(missing).toContain('issue');
    expect(missing).toContain('onset_time');
    expect(missing).toContain('location');
  });

  test('merges extracted slots with persisted slots for continuity', () => {
    const merged = triage.mergeSlots(
      { issue: 'kitchen sink leaking', onset_time: null, location: 'kitchen' },
      { issue: null, onset_time: 'yesterday', location: null },
    );

    expect(merged).toEqual({
      issue: 'kitchen sink leaking',
      onset_time: 'yesterday',
      location: 'kitchen',
    });
  });

  test('builds follow-up guidance when fields are missing', () => {
    const guidance = triage.buildMaintenanceGuidance({
      slots: { issue: null, onset_time: null, location: null },
      missingFields: ['issue', 'onset_time', 'location'],
    });

    expect(guidance).toContain('Missing required fields: issue, onset_time, location');
    expect(guidance).toContain('Ask one concise follow-up question');
  });

  test('builds confirmation guidance when all required fields are present', () => {
    const guidance = triage.buildMaintenanceGuidance({
      slots: { issue: 'sink leaking', onset_time: 'today', location: 'kitchen' },
      missingFields: [],
    });

    expect(guidance).toContain('All required maintenance fields are present');
  });
});
