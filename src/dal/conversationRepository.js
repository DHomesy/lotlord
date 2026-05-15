const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

// ── Conversations ─────────────────────────────────────────────────────────────

/**
 * Find an active (open) conversation for a specific tenant + landlord + channel.
 * Returns null if none exists, so the caller can create one.
 */
async function findActive({ tenantId, ownerId, channel }) {
  const { rows } = await query(
    `SELECT * FROM ai_conversations
     WHERE tenant_id = $1 AND owner_id = $2 AND channel = $3
       AND status IN ('open', 'escalated')
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId, ownerId, channel],
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT c.*,
            u.first_name AS tenant_first_name, u.last_name AS tenant_last_name
     FROM ai_conversations c
     JOIN tenants t ON t.id = c.tenant_id
     JOIN users u   ON u.id = t.user_id
     WHERE c.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Create a new conversation.
 */
async function create({ id, tenantId, ownerId, channel }) {
  const { rows } = await query(
    `INSERT INTO ai_conversations (id, tenant_id, owner_id, channel, status, unread_count, urgency, last_message_at)
     VALUES ($1, $2, $3, $4, 'open', 0, 3, NOW())
     RETURNING *`,
    [id, tenantId, ownerId, channel],
  );
  return rows[0];
}

/**
 * Atomically increment unread_count + update last_message_at.
 * Called whenever a tenant message is appended.
 */
async function touchOnInbound(conversationId) {
  await query(
    `UPDATE ai_conversations
     SET last_message_at = NOW(), unread_count = unread_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [conversationId],
  );
}

/**
 * Update metadata (status, urgency, category, unread_count).
 * Only updates supplied fields.
 */
async function update(id, fields) {
  const allowed = ['status', 'urgency', 'category', 'unread_count'];
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [col, val] of Object.entries(fields)) {
    if (allowed.includes(col) && val !== undefined) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }
  if (!setClauses.length) return null;

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE ai_conversations SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

/**
 * List conversations for a specific landlord, newest first.
 * Includes tenant name + last message preview via JOIN.
 */
async function findAllByOwner(ownerId, { status, urgency, page = 1, limit = 30 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [ownerId, lim, offset];
  let where = `c.owner_id = $1`;

  if (status)  { where += ` AND c.status = $${values.push(status)}`; }
  if (urgency) { where += ` AND c.urgency >= $${values.push(urgency)}`; }

  const { rows } = await query(
    `SELECT
       c.id, c.channel, c.status, c.urgency, c.category,
       c.last_message_at, c.unread_count,
       u.first_name AS tenant_first_name, u.last_name AS tenant_last_name,
       (SELECT content FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
       EXISTS(SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id AND m.suggested = true AND m.sent_at IS NULL) AS has_pending_suggestion
     FROM ai_conversations c
     JOIN tenants t ON t.id = c.tenant_id
     JOIN users u   ON u.id = t.user_id
     WHERE ${where}
     ORDER BY
       CASE WHEN c.urgency >= 4 THEN 0 ELSE 1 END,
       c.last_message_at DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    values,
  );
  return rows;
}

/**
 * List all conversations across all landlords — used by the Owner Supervisor page.
 * Admin-only query; no owner_id scoping.
 */
async function findAllForSupervisor({ status, urgency, ownerId, page = 1, limit = 50 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  const conditions = [];

  if (status)  { conditions.push(`c.status = $${values.push(status)}`); }
  if (urgency) { conditions.push(`c.urgency >= $${values.push(urgency)}`); }
  if (ownerId) { conditions.push(`c.owner_id = $${values.push(ownerId)}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT
       c.id, c.channel, c.status, c.urgency, c.category,
       c.last_message_at, c.unread_count, c.owner_id,
       u.first_name AS tenant_first_name, u.last_name AS tenant_last_name,
       lu.first_name AS landlord_first_name, lu.last_name AS landlord_last_name,
       (SELECT content FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
       EXISTS(SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id AND m.suggested = true AND m.sent_at IS NULL) AS has_pending_suggestion
     FROM ai_conversations c
     JOIN tenants t  ON t.id = c.tenant_id
     JOIN users u    ON u.id = t.user_id
     LEFT JOIN users lu ON lu.id = c.owner_id
     ${where}
     ORDER BY
       CASE WHEN c.urgency >= 4 THEN 0 ELSE 1 END,
       c.last_message_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function appendMessage({
  id, conversationId, role, content,
  suggested = false, tokensUsed = null, modelUsed = null,
  supervisorOverride = false, overrideBy = null,
  logEntryId = null, sentAt = null,
}) {
  const { rows } = await query(
    `INSERT INTO ai_messages
       (id, conversation_id, role, content, tokens_used, model_used,
        suggested, supervisor_override, override_by, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, conversationId, role, content, tokensUsed, modelUsed,
     suggested, supervisorOverride, overrideBy || null, sentAt || null],
  );

  // Keep conversation's last_message_at current for all outbound messages
  // (touchOnInbound handles inbound; this covers assistant + system roles).
  if (rows[0] && rows[0].role !== 'user') {
    await query(
      `UPDATE ai_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );
  }

  // Link the notification log entry if provided
  if (logEntryId) {
    await query(
      `UPDATE notifications_log SET conversation_id = $1 WHERE id = $2`,
      [conversationId, logEntryId],
    );
  }

  return rows[0];
}

/**
 * Get all messages in a conversation ordered oldest-first.
 * Capped at 100 for the thread view; AI prompt uses a separate tighter limit.
 */
async function findMessages(conversationId, { limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT id, role, content, suggested, approved_by, sent_at, supervisor_override, tokens_used, model_used, created_at
     FROM ai_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows;
}

/**
 * Find the most recent unsent AI draft for a conversation.
 */
async function findPendingSuggestion(conversationId) {
  const { rows } = await query(
    `SELECT * FROM ai_messages
     WHERE conversation_id = $1 AND suggested = true AND sent_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId],
  );
  return rows[0] || null;
}

/**
 * Mark an AI draft as sent (approve path).
 */
async function markSent(messageId, approvedBy) {
  const { rows } = await query(
    `UPDATE ai_messages
     SET sent_at = NOW(), suggested = false, approved_by = $2
     WHERE id = $1 AND suggested = true AND sent_at IS NULL
     RETURNING *`,
    [messageId, approvedBy],
  );
  // Touch the conversation timestamp so the inbox list reflects the sent time.
  if (rows[0]) {
    await query(
      `UPDATE ai_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [rows[0].conversation_id],
    );
  }
  return rows[0] || null;
}

/**
 * Reverse a markSent operation — used when delivery fails after the atomic lock.
 * Resets sent_at → NULL and suggested → true so the draft can be retried.
 * Only operates on messages that still have the exact sent_at we set (avoids
 * clobbering a later legitimate send if somehow called out of order).
 */
async function unmarkSent(messageId) {
  await query(
    `UPDATE ai_messages
     SET sent_at = NULL, suggested = true, approved_by = NULL
     WHERE id = $1 AND sent_at IS NOT NULL`,
    [messageId],
  );
}

/**
 * Delete an unsent AI draft (dismiss path).
 */
async function deleteSuggestion(messageId) {
  const { rows } = await query(
    `DELETE FROM ai_messages
     WHERE id = $1 AND suggested = true AND sent_at IS NULL
     RETURNING id`,
    [messageId],
  );
  return rows[0] || null;
}

/**
 * Count AI-drafted messages sent in the last 24 hours for a given tenant (rate limit).
 */
async function countRecentAiReplies(tenantId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt
     FROM ai_messages m
     JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE c.tenant_id = $1
       AND m.role = 'assistant'
       AND m.model_used IS NOT NULL
       AND m.sent_at IS NOT NULL
       AND m.sent_at > NOW() - INTERVAL '24 hours'`,
    [tenantId],
  );
  return parseInt(rows[0].cnt, 10);
}

module.exports = {
  findActive,
  findById,
  create,
  touchOnInbound,
  update,
  findAllByOwner,
  findAllForSupervisor,
  appendMessage,
  findMessages,
  findPendingSuggestion,
  markSent,
  unmarkSent,
  deleteSuggestion,
  countRecentAiReplies,
};
