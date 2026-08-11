const env = require('../config/env');

const WORKFLOW_TYPES = {
  TENANT_TRIAGE: 'tenant_triage',
  OWNER_QA: 'owner_qa',
};

const SYSTEM_POLICY_BLOCK = [
  'D.1 Prompt Policy:',
  '- Follow safety and scope rules from the system prompt.',
  '- Escalation is a risk/review state and does not disable AI by itself.',
  '- If automation mode is human_only, do not generate AI drafts.',
  '- Do not claim side effects (ticket creation, notifications, payments) unless confirmed by backend action.',
].join('\n');

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function estimateTokens(text) {
  // Conservative heuristic for plain English text.
  return Math.ceil(String(text || '').length / 4);
}

function truncateToTokenBudget(text, tokenBudget) {
  const maxChars = Math.max(0, tokenBudget * 4);
  return String(text || '').slice(0, maxChars);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }));
}

function selectRecentHistoryWithinBudget(history, { tokenBudget, maxRecentTurns }) {
  const safeHistory = sanitizeHistory(history);
  if (!safeHistory.length || tokenBudget <= 0 || maxRecentTurns <= 0) return [];

  let used = 0;
  const selectedReversed = [];

  for (let i = safeHistory.length - 1; i >= 0; i -= 1) {
    if (selectedReversed.length >= maxRecentTurns) break;

    const msg = safeHistory[i];
    const msgTokens = estimateTokens(msg.content);

    if (selectedReversed.length === 0 && msgTokens > tokenBudget) {
      selectedReversed.push({
        role: msg.role,
        content: truncateToTokenBudget(msg.content, tokenBudget),
      });
      break;
    }

    if (used + msgTokens > tokenBudget) break;

    selectedReversed.push(msg);
    used += msgTokens;
  }

  return selectedReversed.reverse();
}

// D.1 placeholders: deterministic interfaces without retrieval/storage implementation yet.
async function getStructuredFactsContext() {
  return null;
}

async function getRollingSummaryContext() {
  return null;
}

function getWorkflowTokenBudget(workflowType) {
  const tenantBudget = toPositiveInt(env.AI_PROMPT_BUDGET_TENANT_TOKENS, 1800);
  const ownerBudget = toPositiveInt(env.AI_PROMPT_BUDGET_OWNER_QA_TOKENS, 2200);

  if (workflowType === WORKFLOW_TYPES.OWNER_QA) {
    return ownerBudget;
  }
  return tenantBudget;
}

function buildSystemContext({ policyContext, structuredFacts, rollingSummary }) {
  const sections = [SYSTEM_POLICY_BLOCK];

  if (structuredFacts) {
    sections.push(`Structured facts:\n${structuredFacts}`);
  }
  if (rollingSummary) {
    sections.push(`Rolling summary:\n${rollingSummary}`);
  }
  if (policyContext) {
    sections.push(`Tenant profile context:\n${policyContext}`);
  }

  return sections.join('\n\n');
}

async function buildPromptEnvelope({
  workflowType = WORKFLOW_TYPES.TENANT_TRIAGE,
  conversationId,
  tenantId,
  ownerId,
  policyContext = '',
  history = [],
  newMessage = '',
}) {
  const [structuredFacts, rollingSummary] = await Promise.all([
    getStructuredFactsContext({ workflowType, conversationId, tenantId, ownerId }),
    getRollingSummaryContext({ workflowType, conversationId, tenantId, ownerId }),
  ]);

  const systemContext = buildSystemContext({ policyContext, structuredFacts, rollingSummary });
  const maxRecentTurns = toPositiveInt(env.AI_PROMPT_MAX_RECENT_TURNS, 20);
  const totalInputBudget = getWorkflowTokenBudget(workflowType);

  // Reserve room for system context + incoming message + completion headroom.
  const reserved = estimateTokens(systemContext) + estimateTokens(newMessage) + 400;
  const historyBudget = Math.max(200, totalInputBudget - reserved);

  const selectedHistory = selectRecentHistoryWithinBudget(history, {
    tokenBudget: historyBudget,
    maxRecentTurns,
  });

  return {
    workflowType,
    systemContext,
    history: selectedHistory,
    budget: {
      totalInputTokens: totalInputBudget,
      reservedTokens: reserved,
      historyTokens: historyBudget,
      maxRecentTurns,
    },
    memory: {
      structuredFactsPresent: !!structuredFacts,
      rollingSummaryPresent: !!rollingSummary,
    },
  };
}

module.exports = {
  WORKFLOW_TYPES,
  buildPromptEnvelope,
  getStructuredFactsContext,
  getRollingSummaryContext,
  // Exposed for unit tests
  _private: {
    estimateTokens,
    selectRecentHistoryWithinBudget,
    buildSystemContext,
    toPositiveInt,
    truncateToTokenBudget,
  },
};
