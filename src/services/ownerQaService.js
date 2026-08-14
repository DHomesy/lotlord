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

function normalizeIntent(intent) {
  const value = String(intent || '').toLowerCase().trim();
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
  const totalOpen = summaryRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return `There are ${totalOpen} open/in-progress maintenance request(s) in the portfolio.`;
}

async function getOwnerSnapshot({ ownerId, intent, daysAhead, limit }) {
  if (!ownerId) {
    throw Object.assign(new Error('ownerId is required for owner Q&A'), { status: 400 });
  }

  const normalizedIntent = normalizeIntent(intent);
  const safeDaysAhead = toIntInRange(daysAhead, 14, 1, 90);
  const safeLimit = toIntInRange(limit, 10, 1, 25);
  const generatedAt = new Date().toISOString();

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
    items: overview.recent,
    breakdown: overview.summary,
  };
}

module.exports = {
  OWNER_QA_INTENTS,
  getOwnerSnapshot,
};
