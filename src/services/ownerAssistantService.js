const ownerQaService = require('./ownerQaService');
const ownerAssistantRepo = require('../dal/ownerAssistantRepository');
const audit = require('./auditService');

function buildContextSnapshot(session, recentMessages) {
  const list = Array.isArray(recentMessages) ? recentMessages : [];
  const topIntents = {};
  for (const msg of list) {
    const key = String(msg.intent || 'unknown');
    topIntents[key] = (topIntents[key] || 0) + 1;
  }

  const intentHistogram = Object.entries(topIntents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }));

  return {
    mode: 'rolling_summary_plus_recent_turns',
    rollingSummary: String(session?.rolling_summary || '').slice(0, 800),
    lastIntent: session?.last_intent || null,
    messageCount: Number(session?.message_count || 0),
    recentPrompt: list[0]?.prompt || null,
    intentHistogram,
  };
}

async function listOwnerSessions(ownerId, { limit, page, search } = {}) {
  return ownerAssistantRepo.listSessions(ownerId, { limit, page, search });
}

async function createOwnerSession(ownerId, { title } = {}) {
  const session = await ownerAssistantRepo.createSession(ownerId, { title });
  audit.log({
    action: 'owner_ai_session_created',
    resourceType: 'owner_ai_session',
    resourceId: session?.id || null,
    userId: ownerId,
    metadata: { title: session?.title || null },
  });
  return session;
}

async function getOwnerSessionDetail(ownerId, sessionId, { limit, page } = {}) {
  const detail = await ownerAssistantRepo.getSessionWithMessages(sessionId, { limit, page });
  if (!detail || detail.session.owner_id !== ownerId) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }
  return detail;
}

async function renameOwnerSession(ownerId, sessionId, { title } = {}) {
  const current = await ownerAssistantRepo.findSessionById(sessionId);
  if (!current || current.owner_id !== ownerId) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }

  const updated = await ownerAssistantRepo.updateSessionTitle(sessionId, title);
  if (!updated) {
    throw Object.assign(new Error('Session title is required'), { status: 400 });
  }

  audit.log({
    action: 'owner_ai_session_renamed',
    resourceType: 'owner_ai_session',
    resourceId: sessionId,
    userId: ownerId,
    metadata: {
      before: current.title,
      after: updated.title,
    },
  });

  return updated;
}

async function removeOwnerSession(ownerId, sessionId) {
  const current = await ownerAssistantRepo.findSessionById(sessionId);
  if (!current || current.owner_id !== ownerId) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }

  const deleted = await ownerAssistantRepo.deleteSession(sessionId);
  audit.log({
    action: 'owner_ai_session_deleted',
    resourceType: 'owner_ai_session',
    resourceId: sessionId,
    userId: ownerId,
    metadata: {
      title: current.title,
      deleted: !!deleted,
    },
  });
  return deleted;
}

async function runSessionSnapshot({ ownerId, sessionId, intent, prompt, daysAhead, limit }) {
  const session = await ownerAssistantRepo.findSessionById(sessionId);
  if (!session || session.owner_id !== ownerId) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }

  const recentDetail = await ownerAssistantRepo.getSessionWithMessages(sessionId, { limit: 5, page: 1 });
  const contextSnapshot = buildContextSnapshot(session, recentDetail?.messages || []);

  const snapshot = await ownerQaService.getOwnerSnapshot({
    ownerId,
    intent,
    prompt,
    daysAhead,
    limit,
  });

  const enrichedSnapshot = {
    ...snapshot,
    contextSnapshot,
  };

  const message = await ownerAssistantRepo.appendSnapshot({
    sessionId,
    ownerId,
    prompt,
    snapshot: enrichedSnapshot,
  });

  audit.log({
    action: 'owner_ai_session_snapshot_saved',
    resourceType: 'owner_ai_session',
    resourceId: sessionId,
    userId: ownerId,
    metadata: {
      intent: snapshot.intent,
      itemCount: Array.isArray(snapshot.items) ? snapshot.items.length : 0,
      messageId: message?.id || null,
      contextMode: contextSnapshot.mode,
      fallbackRecommended: !!snapshot?.quality?.policy?.fallbackRecommended,
      fallbackRoute: snapshot?.quality?.policy?.fallbackRoute || null,
      protocolAction: snapshot?.protocol?.action || null,
    },
  });

  return { sessionId, snapshot: enrichedSnapshot, message };
}

module.exports = {
  listOwnerSessions,
  createOwnerSession,
  getOwnerSessionDetail,
  renameOwnerSession,
  removeOwnerSession,
  runSessionSnapshot,
};
