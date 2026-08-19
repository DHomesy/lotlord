const ownerQaRepo = require('../dal/ownerQaRepository');
const ownerQaQualityRepo = require('../dal/ownerQaQualityRepository');

const OWNER_QA_INTENTS = {
  UPCOMING_DUES: 'upcoming_dues',
  PAST_DUE_TENANTS: 'past_due_tenants',
  BALANCE_BY_TENANT: 'balance_by_tenant',
  AGING_SUMMARY: 'aging_summary',
  MAINTENANCE_OVERVIEW: 'maintenance_overview',
};

const INTENT_CONFIDENCE_THRESHOLDS = {
  [OWNER_QA_INTENTS.UPCOMING_DUES]: 0.7,
  [OWNER_QA_INTENTS.PAST_DUE_TENANTS]: 0.7,
  [OWNER_QA_INTENTS.BALANCE_BY_TENANT]: 0.7,
  [OWNER_QA_INTENTS.AGING_SUMMARY]: 0.7,
  [OWNER_QA_INTENTS.MAINTENANCE_OVERVIEW]: 0.75,
};

const CONFIDENCE_SCORE = {
  high: 0.9,
  medium: 0.6,
  low: 0.35,
};

function toIntInRange(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toMoney(n) {
  return Number(n || 0).toFixed(2);
}

function inferIntentFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text.trim()) return null;

  if (/maintenance|repair|work order|ticket|completed|in progress|open requests?/.test(text)) {
    return OWNER_QA_INTENTS.MAINTENANCE_OVERVIEW;
  }
  if (/past due|overdue|late rent|delinquent|behind/.test(text)) {
    if (/aging|age bucket|1-30|31-60|61-90|90\+/.test(text)) {
      return OWNER_QA_INTENTS.AGING_SUMMARY;
    }
    return OWNER_QA_INTENTS.PAST_DUE_TENANTS;
  }
  if (/aging|age bucket|arrears aging|overdue buckets?/.test(text)) {
    return OWNER_QA_INTENTS.AGING_SUMMARY;
  }
  if (/balance|outstanding|owe|owed|by tenant|tenant balances?/.test(text)) {
    return OWNER_QA_INTENTS.BALANCE_BY_TENANT;
  }
  if (/upcoming|next|due soon|coming due|next 30|next month|dues/.test(text)) {
    return OWNER_QA_INTENTS.UPCOMING_DUES;
  }
  return null;
}

function normalizeIntent(intent, prompt) {
  const value = String(intent || '').toLowerCase().trim();
  if (!value) {
    const inferred = inferIntentFromPrompt(prompt);
    if (!inferred) {
      throw Object.assign(
        new Error('Could not infer owner Q&A intent from prompt. Provide a clearer prompt or explicit intent.'),
        { status: 400 },
      );
    }
    return inferred;
  }
  const valid = Object.values(OWNER_QA_INTENTS);
  if (!valid.includes(value)) {
    throw Object.assign(new Error(`Unsupported owner Q&A intent: ${intent}`), { status: 400 });
  }
  return value;
}

function validatePrompt(prompt) {
  if (prompt === undefined || prompt === null) return;
  if (typeof prompt !== 'string') {
    throw Object.assign(new Error('prompt must be a string'), { status: 400 });
  }
  if (prompt.length > 2000) {
    throw Object.assign(new Error('prompt must be 2000 characters or fewer'), { status: 400 });
  }
}

function summarizeUpcomingDues(items, daysAhead) {
  const total = items.reduce((sum, row) => sum + Number(row.amount_due || 0), 0);
  return `Found ${items.length} upcoming due charge(s) in the next ${daysAhead} day(s), totaling $${toMoney(total)}.`;
}

function summarizePastDue(items) {
  const total = items.reduce((sum, row) => sum + Number(row.overdue_amount || 0), 0);
  return `Found ${items.length} tenant(s) with past-due balances totaling $${toMoney(total)}.`;
}

function summarizeBalances(items) {
  const total = items.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  return `Found ${items.length} tenant balance row(s) with total outstanding balance $${toMoney(total)}.`;
}

function summarizeAging(items) {
  const total = items.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const charges = items.reduce((sum, row) => sum + Number(row.charge_count || 0), 0);
  return `Aging summary includes ${charges} overdue charge(s) totaling $${toMoney(total)} across ${items.length} bucket(s).`;
}

function summarizeMaintenance(summaryRows) {
  const total = summaryRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const completed = summaryRows
    .filter((row) => String(row.status || '').toLowerCase() === 'completed')
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  return `There are ${total} maintenance request(s) in scope, including ${completed} completed.`;
}

function buildQuality({ intent, items, generatedAt }) {
  const count = Array.isArray(items) ? items.length : 0;
  let confidence = 'high';
  let rationale = 'deterministic owner-scoped query returned direct records';

  if (intent === OWNER_QA_INTENTS.MAINTENANCE_OVERVIEW || intent === OWNER_QA_INTENTS.AGING_SUMMARY) {
    confidence = count > 0 ? 'high' : 'medium';
  }
  if (count === 0) {
    confidence = 'medium';
    rationale = 'query succeeded but returned no matching records for current filters/time window';
  }

  const score = CONFIDENCE_SCORE[confidence] ?? 0.6;
  const threshold = INTENT_CONFIDENCE_THRESHOLDS[intent] ?? 0.7;
  const metThreshold = score >= threshold;
  const fallbackRecommended = !metThreshold;

  return {
    confidence,
    rationale,
    itemCount: count,
    generatedAt,
    broker: 'owner_qa_deterministic_v1',
    promptReplay: 'none',
    policy: {
      threshold,
      score,
      metThreshold,
      fallbackRecommended,
      fallbackRoute: metThreshold ? null : 'human_review',
      fallbackReason: metThreshold ? null : 'confidence_below_threshold',
    },
  };
}

function buildProtocol({ intent, quality }) {
  const fallback = quality?.policy?.fallbackRecommended
    ? {
      route: quality.policy.fallbackRoute || 'human_review',
      reason: quality.policy.fallbackReason || 'confidence_below_threshold',
      required: true,
    }
    : {
      route: null,
      reason: null,
      required: false,
    };

  return {
    action: 'owner_qa_snapshot',
    intent,
    execution: 'deterministic_query_broker',
    fallback,
  };
}

async function persistQualityOutcome({ ownerId, intent, quality }) {
  try {
    await ownerQaQualityRepo.recordOutcome({
      ownerId,
      intent,
      confidence: quality?.confidence || 'medium',
      fallbackRecommended: !!quality?.policy?.fallbackRecommended,
    });
  } catch (err) {
    // Metrics persistence is best-effort and must not fail owner-facing queries.
    console.warn('[ownerQaService] Failed to persist quality metric:', err.message);
  }
}

async function getOwnerSnapshot({ ownerId, intent, prompt, daysAhead, limit }) {
  if (!ownerId) {
    throw Object.assign(new Error('ownerId is required for owner Q&A'), { status: 400 });
  }

  validatePrompt(prompt);
  const normalizedIntent = normalizeIntent(intent, prompt);
  const safeDaysAhead = toIntInRange(daysAhead, 30, 1, 90);
  const safeLimit = toIntInRange(limit, 10, 1, 25);
  const generatedAt = new Date().toISOString();
  const policyNote = 'No maintenance statuses were changed by this snapshot. Status updates require explicit landlord or tenant workflow actions.';

  if (normalizedIntent === OWNER_QA_INTENTS.UPCOMING_DUES) {
    const items = await ownerQaRepo.getUpcomingDues({ ownerId, daysAhead: safeDaysAhead, limit: safeLimit });
    const quality = buildQuality({ intent: normalizedIntent, items, generatedAt });
    await persistQualityOutcome({ ownerId, intent: normalizedIntent, quality });
    return {
      intent: normalizedIntent,
      title: 'Upcoming Dues Snapshot',
      generatedAt,
      dateContext: {
        type: 'window',
        daysAhead: safeDaysAhead,
        from: new Date().toISOString().slice(0, 10),
      },
      summary: summarizeUpcomingDues(items, safeDaysAhead),
      policyNote,
      protocol: buildProtocol({ intent: normalizedIntent, quality }),
      quality,
      items,
    };
  }

  if (normalizedIntent === OWNER_QA_INTENTS.PAST_DUE_TENANTS) {
    const items = await ownerQaRepo.getPastDueTenants({ ownerId, limit: safeLimit });
    const quality = buildQuality({ intent: normalizedIntent, items, generatedAt });
    await persistQualityOutcome({ ownerId, intent: normalizedIntent, quality });
    return {
      intent: normalizedIntent,
      title: 'Past-Due Tenants Snapshot',
      generatedAt,
      dateContext: {
        type: 'as_of',
        date: new Date().toISOString().slice(0, 10),
      },
      summary: summarizePastDue(items),
      policyNote,
      protocol: buildProtocol({ intent: normalizedIntent, quality }),
      quality,
      items,
    };
  }

  if (normalizedIntent === OWNER_QA_INTENTS.BALANCE_BY_TENANT) {
    const items = await ownerQaRepo.getTenantBalances({ ownerId, limit: safeLimit });
    const quality = buildQuality({ intent: normalizedIntent, items, generatedAt });
    await persistQualityOutcome({ ownerId, intent: normalizedIntent, quality });
    return {
      intent: normalizedIntent,
      title: 'Tenant Balance Snapshot',
      generatedAt,
      dateContext: {
        type: 'as_of',
        date: new Date().toISOString().slice(0, 10),
      },
      summary: summarizeBalances(items),
      policyNote,
      protocol: buildProtocol({ intent: normalizedIntent, quality }),
      quality,
      items,
    };
  }

  if (normalizedIntent === OWNER_QA_INTENTS.AGING_SUMMARY) {
    const items = await ownerQaRepo.getAgingSummary({ ownerId });
    const quality = buildQuality({ intent: normalizedIntent, items, generatedAt });
    await persistQualityOutcome({ ownerId, intent: normalizedIntent, quality });
    return {
      intent: normalizedIntent,
      title: 'Aging Summary Snapshot',
      generatedAt,
      dateContext: {
        type: 'as_of',
        date: new Date().toISOString().slice(0, 10),
      },
      summary: summarizeAging(items),
      policyNote,
      protocol: buildProtocol({ intent: normalizedIntent, quality }),
      quality,
      items,
    };
  }

  const overview = await ownerQaRepo.getMaintenanceOverview({ ownerId, limit: safeLimit });
  const quality = buildQuality({ intent: normalizedIntent, items: overview.recent, generatedAt });
  await persistQualityOutcome({ ownerId, intent: normalizedIntent, quality });
  return {
    intent: normalizedIntent,
    title: 'Maintenance Overview Snapshot',
    generatedAt,
    dateContext: {
      type: 'as_of',
      date: new Date().toISOString().slice(0, 10),
    },
    summary: summarizeMaintenance(overview.summary),
    policyNote,
    protocol: buildProtocol({ intent: normalizedIntent, quality }),
    quality,
    items: overview.recent,
    breakdown: overview.summary,
  };
}

module.exports = {
  OWNER_QA_INTENTS,
  inferIntentFromPrompt,
  getOwnerSnapshot,
};
