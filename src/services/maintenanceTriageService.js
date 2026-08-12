const REQUIRED_MAINTENANCE_FIELDS = ['issue', 'onset_time', 'location'];

function normalize(str) {
  return String(str || '').trim();
}

function extractIssue(text) {
  const t = text.toLowerCase();
  const patterns = [
    /(?:my|the)?\s*(toilet|sink|faucet|tap|shower|bath|ac|a\/c|heater|heat|fridge|refrigerator|oven|stove|dishwasher|window|door|lock|ceiling|wall|pipe|plumbing|electrical|light|outlet)\s+(?:is|has|keeps|won't|wont|not)\s+[^.?!\n]+/i,
    /(leak(?:ing)?|flood(?:ing)?|mold|no heat|no hot water|power out(?:age)?|broken\s+\w+)/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) return normalize(match[0]);
  }

  return null;
}

function extractOnsetTime(text) {
  const t = text.toLowerCase();
  const patterns = [
    /(today|yesterday|tonight|this morning|this afternoon|this evening)/i,
    /(last\s+(night|week|month))/i,
    /(\d+\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+ago)/i,
    /(since\s+[^.?!\n]+)/i,
    /(started\s+[^.?!\n]+)/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) return normalize(match[0]);
  }

  return null;
}

function extractLocation(text) {
  const patterns = [
    /(kitchen|bathroom|bedroom|living room|hallway|garage|basement|attic|laundry room|outside|patio)/i,
    /(unit\s+\w+)/i,
    /(room\s+\w+)/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) return normalize(match[0]);
  }

  return null;
}

function deriveMaintenanceSlots({ history = [], newMessage = '' }) {
  const combined = [
    ...history.map((m) => String(m.content || '')),
    String(newMessage || ''),
  ].join('\n');

  const issue = extractIssue(combined);
  const onsetTime = extractOnsetTime(combined);
  const location = extractLocation(combined);

  return {
    issue,
    onset_time: onsetTime,
    location,
  };
}

function mergeSlots(baseSlots = {}, extractedSlots = {}) {
  return {
    issue: normalize(extractedSlots.issue) || normalize(baseSlots.issue) || null,
    onset_time: normalize(extractedSlots.onset_time) || normalize(baseSlots.onset_time) || null,
    location: normalize(extractedSlots.location) || normalize(baseSlots.location) || null,
  };
}

function getMissingFields(slots) {
  return REQUIRED_MAINTENANCE_FIELDS.filter((field) => !normalize(slots[field]));
}

function buildMaintenanceGuidance({ slots, missingFields }) {
  const lines = [
    'Maintenance triage policy:',
    '- Your goal is to gather required fields before any ticket action path.',
    '- Required fields: issue, onset_time, location.',
    '- Do not ask for tenant name or property address; use known account context.',
    '- Do not claim a ticket was created unless backend action confirms it.',
  ];

  lines.push('');
  lines.push(`Known slots: issue=${slots.issue || 'missing'}; onset_time=${slots.onset_time || 'missing'}; location=${slots.location || 'missing'}`);

  if (missingFields.length) {
    lines.push(`Missing required fields: ${missingFields.join(', ')}`);
    lines.push('Ask one concise follow-up question that requests the highest-priority missing field first.');
  } else {
    lines.push('All required maintenance fields are present. Confirm details and provide next-step expectation.');
  }

  return lines.join('\n');
}

module.exports = {
  REQUIRED_MAINTENANCE_FIELDS,
  deriveMaintenanceSlots,
  mergeSlots,
  getMissingFields,
  buildMaintenanceGuidance,
};
