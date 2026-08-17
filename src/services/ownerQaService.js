const ownerQaRepo = require('../dal/ownerQaRepository');

const OWNER_QA_INTENTS = {
  UPCOMING_DUES: 'upcoming_dues',
  PAST_DUE_TENANTS: 'past_due_tenants',
  BALANCE_BY_TENANT: 'balance_by_tenant',
  MAINTENANCE_OVERVIEW: 'maintenance_overview',
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
    return OWNER_QA_INTENTS.PAST_DUE_TENANTS;
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

function summarizeMaintenance(summaryRows) {
  const total = summaryRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const completed = summaryRows
    .filter((row) => String(row.status || '').toLowerCase() === 'completed')
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  return `There are ${total} maintenance request(s) in scope, including ${completed} completed.`;
}

async function getOwnerSnapshot({ ownerId, intent, prompt, daysAhead, limit }) {
  if (!ownerId) {
    throw Object.assign(new Error('ownerId is required for owner Q&A'), { status: 400 });
  }

  const normalizedIntent = normalizeIntent(intent, prompt);
  const safeDaysAhead = toIntInRange(daysAhead, 30, 1, 90);
  const safeLimit = toIntInRange(limit, 10, 1, 25);
  const generatedAt = new Date().toISOString();
  const policyNote = 'No maintenance statuses were changed by this snapshot. Status updates require explicit landlord or tenant workflow actions.';

  if (normalizedIntent === OWNER_QA_INTENTS.UPCOMING_DUES) {
    const items = await ownerQaRepo.getUpcomingDues({ ownerId, daysAhead: safeDaysAhead, limit: safeLimit });
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
      items,
    };
  }

  if (normalizedIntent === OWNER_QA_INTENTS.PAST_DUE_TENANTS) {
    const items = await ownerQaRepo.getPastDueTenants({ ownerId, limit: safeLimit });
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
      items,
    };
  }

  if (normalizedIntent === OWNER_QA_INTENTS.BALANCE_BY_TENANT) {
    const items = await ownerQaRepo.getTenantBalances({ ownerId, limit: safeLimit });
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
      items,
    };
  }

  const overview = await ownerQaRepo.getMaintenanceOverview({ ownerId, limit: safeLimit });
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
    items: overview.recent,
    breakdown: overview.summary,
  };
}

module.exports = {
  OWNER_QA_INTENTS,
  inferIntentFromPrompt,
  getOwnerSnapshot,
};
