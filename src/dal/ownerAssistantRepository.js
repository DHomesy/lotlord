const { query } = require('../config/db');

const ROLLING_SUMMARY_LIMIT = 4000;

function compactSummaryForMessage({ prompt, snapshot }) {
  const promptText = String(prompt || '').trim();
  const summary = String(snapshot?.summary || '').trim();
  const intent = String(snapshot?.intent || '').trim();
  const itemCount = Array.isArray(snapshot?.items) ? snapshot.items.length : 0;
  const line = `Q: ${promptText} | intent=${intent} | items=${itemCount} | ${summary}`;
  return line.slice(0, 500);
}

async function listSessions(ownerId, { limit = 20, page = 1, search } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(String(limit || 20), 10) || 20));
  const safePage = Math.max(1, Number.parseInt(String(page || 1), 10) || 1);
  const offset = (safePage - 1) * safeLimit;
  const searchText = String(search || '').trim();

  const params = [ownerId];
  let whereClause = 'owner_id = $1';
  if (searchText) {
    whereClause += ` AND (title ILIKE $${params.length + 1} OR COALESCE(rolling_summary, '') ILIKE $${params.length + 1})`;
    params.push(`%${searchText}%`);
  }

  const countSql = `SELECT COUNT(*)::int AS total FROM owner_ai_sessions WHERE ${whereClause}`;
  const listSql = `
    SELECT id, owner_id, title, rolling_summary, last_intent, message_count, created_at, updated_at
    FROM owner_ai_sessions
    WHERE ${whereClause}
    ORDER BY updated_at DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(countSql, params),
    query(listSql, [...params, safeLimit, offset]),
  ]);

  const total = Number(countRows[0]?.total || 0);
  return {
    sessions: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit < total,
    },
  };
}

async function createSession(ownerId, { title } = {}) {
  const safeTitle = String(title || '').trim() || 'Owner AI Session';
  const { rows } = await query(
    `INSERT INTO owner_ai_sessions (owner_id, title)
     VALUES ($1, $2)
     RETURNING id, owner_id, title, rolling_summary, last_intent, message_count, created_at, updated_at`,
    [ownerId, safeTitle.slice(0, 120)],
  );
  return rows[0] || null;
}

async function findSessionById(sessionId) {
  const { rows } = await query(
    `SELECT id, owner_id, title, rolling_summary, last_intent, message_count, created_at, updated_at
     FROM owner_ai_sessions
     WHERE id = $1
     LIMIT 1`,
    [sessionId],
  );
  return rows[0] || null;
}

async function getSessionWithMessages(sessionId, { limit = 30, page = 1 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit || 30), 10) || 30));
  const safePage = Math.max(1, Number.parseInt(String(page || 1), 10) || 1);
  const offset = (safePage - 1) * safeLimit;
  const session = await findSessionById(sessionId);
  if (!session) return null;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total
       FROM owner_ai_messages
       WHERE session_id = $1`,
      [sessionId],
    ),
    query(
      `SELECT id, session_id, owner_id, prompt, intent, snapshot, compact_summary, created_at
       FROM owner_ai_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sessionId, safeLimit, offset],
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    session,
    messages: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit < total,
    },
  };
}

async function updateSessionTitle(sessionId, title) {
  const safeTitle = String(title || '').trim();
  if (!safeTitle) return null;
  const { rows } = await query(
    `UPDATE owner_ai_sessions
     SET title = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, owner_id, title, rolling_summary, last_intent, message_count, created_at, updated_at`,
    [sessionId, safeTitle.slice(0, 120)],
  );
  return rows[0] || null;
}

async function deleteSession(sessionId) {
  const { rows } = await query(
    `DELETE FROM owner_ai_sessions
     WHERE id = $1
     RETURNING id, owner_id, title`,
    [sessionId],
  );
  return rows[0] || null;
}

async function appendSnapshot({ sessionId, ownerId, prompt, snapshot }) {
  const compactSummary = compactSummaryForMessage({ prompt, snapshot });
  const intent = String(snapshot?.intent || 'unknown').slice(0, 80);

  const { rows } = await query(
    `INSERT INTO owner_ai_messages (session_id, owner_id, prompt, intent, snapshot, compact_summary)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, session_id, owner_id, prompt, intent, snapshot, compact_summary, created_at`,
    [sessionId, ownerId, String(prompt || '').trim(), intent, JSON.stringify(snapshot || {}), compactSummary],
  );

  const inserted = rows[0] || null;

  await query(
    `UPDATE owner_ai_sessions
     SET message_count = message_count + 1,
         last_intent = $2,
         rolling_summary = LEFT(
           CASE
             WHEN COALESCE(rolling_summary, '') = '' THEN $3
             ELSE rolling_summary || E'\n' || $3
           END,
           $4
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [sessionId, intent, compactSummary, ROLLING_SUMMARY_LIMIT],
  );

  return inserted;
}

module.exports = {
  listSessions,
  createSession,
  findSessionById,
  getSessionWithMessages,
  updateSessionTitle,
  deleteSession,
  appendSnapshot,
};
