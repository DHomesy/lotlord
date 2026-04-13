const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

// ── Templates ─────────────────────────────────────────────────────────────────

async function findAllTemplates({ channel, triggerEvent, page = 1, limit = 20 } = {}) {
  const { limit: limitNum, offset } = parsePagination(page, limit);
  const values = [limitNum, offset];
  const conditions = ['1=1'];
  let idx = 3;

  if (channel)      { conditions.push(`channel = $${idx++}`);       values.push(channel); }
  if (triggerEvent) { conditions.push(`trigger_event = $${idx++}`); values.push(triggerEvent); }

  const { rows } = await query(
    `SELECT * FROM notification_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findTemplateById(id) {
  const { rows } = await query(
    'SELECT * FROM notification_templates WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

/**
 * Look up the first template matching a trigger_event + channel.
 * Used by scheduled jobs so they don't need to hard-code template IDs.
 */
async function findTemplateByEvent(triggerEvent, channel = 'email') {
  const { rows } = await query(
    `SELECT * FROM notification_templates
      WHERE trigger_event = $1 AND channel = $2
      ORDER BY created_at DESC LIMIT 1`,
    [triggerEvent, channel],
  );
  return rows[0] || null;
}

async function createTemplate({ id, name, channel, triggerEvent, subject, bodyTemplate }) {
  const { rows } = await query(
    `INSERT INTO notification_templates (id, name, channel, trigger_event, subject, body_template)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, name, channel, triggerEvent, subject || null, bodyTemplate],
  );
  return rows[0];
}

async function updateTemplate(id, fields) {
  const allowed = {
    name:         'name',
    channel:      'channel',
    triggerEvent: 'trigger_event',
    subject:      'subject',
    bodyTemplate: 'body_template',
  };

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, col] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) return null;
  setClauses.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await query(
    `UPDATE notification_templates SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

// ── Log ───────────────────────────────────────────────────────────────────────

async function findLog({ recipientId, channel, status, page = 1, limit = 20 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  const conditions = ['1=1'];
  let idx = 3;

  if (recipientId) { conditions.push(`l.recipient_id = $${idx++}`); values.push(recipientId); }
  if (channel)     { conditions.push(`l.channel = $${idx++}`);      values.push(channel); }
  if (status)      { conditions.push(`l.status = $${idx++}`);       values.push(status); }

  const { rows } = await query(
    `SELECT l.*,
            u.email      AS recipient_email,
            u.first_name AS recipient_first_name,
            u.last_name  AS recipient_last_name
       FROM notifications_log l
       JOIN users u ON u.id = l.recipient_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.created_at DESC
      LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findLogById(id) {
  const { rows } = await query(
    `SELECT l.*,
            u.email      AS recipient_email,
            u.first_name AS recipient_first_name,
            u.last_name  AS recipient_last_name
       FROM notifications_log l
       JOIN users u ON u.id = l.recipient_id
      WHERE l.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Insert a new log entry and return it.
 * externalId  — provider message ID (e.g. Gmail messageId) for dedup
 * threadId    — provider thread/conversation ID (e.g. Gmail threadId) for in-thread replies
 */
async function createLogEntry({ id, templateId, recipientId, channel, status, subject, body, externalId, threadId }) {
  const { rows } = await query(
    `INSERT INTO notifications_log
       (id, template_id, recipient_id, channel, status, subject, body, external_id, thread_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, templateId || null, recipientId, channel, status, subject || null, body || null, externalId || null, threadId || null],
  );
  return rows[0];
}

/**
 * Stamp a log entry as sent or failed after the send attempt.
 */
async function updateLogEntry(id, { status, sentAt, errorMessage }) {
  const { rows } = await query(
    `UPDATE notifications_log
        SET status = $1, sent_at = $2, error_message = $3
      WHERE id = $4
      RETURNING *`,
    [status, sentAt || null, errorMessage || null, id],
  );
  return rows[0] || null;
}

async function deleteTemplate(id) {
  const { rowCount } = await query(
    'DELETE FROM notification_templates WHERE id = $1',
    [id],
  );
  return rowCount > 0;
}

/**
 * Returns one row per tenant we have ever communicated with, showing
 * the most recent message timestamp, subject, direction, and a count
 * of unread (received) messages not yet followed up with a sent reply.
 *
 * "direction" is derived from status:
 *   status = 'received'                    → 'inbound'  (tenant wrote to us)
 *   status IN ('queued','sent','failed')   → 'outbound' (we wrote to tenant)
 */
async function findConversations() {
  const { rows } = await query(`
    WITH last_msg AS (
      SELECT DISTINCT ON (l.recipient_id)
             l.recipient_id,
             l.subject,
             l.body,
             l.channel,
             l.status,
             l.created_at,
             CASE WHEN l.status = 'received' THEN 'inbound' ELSE 'outbound' END AS direction
        FROM notifications_log l
       ORDER BY l.recipient_id, l.created_at DESC
    ),
    unread AS (
      SELECT recipient_id, COUNT(*) AS unread_count
        FROM notifications_log
       WHERE status = 'received'
       GROUP BY recipient_id
    )
    SELECT
      t.id               AS tenant_id,
      u.id               AS user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      t.email_opt_in,
      t.sms_opt_in,
      lm.subject         AS last_subject,
      lm.body            AS last_body,
      lm.channel         AS last_channel,
      lm.direction       AS last_direction,
      lm.created_at      AS last_at,
      COALESCE(ur.unread_count, 0) AS unread_count
    FROM   tenants t
    JOIN   users u   ON u.id = t.user_id
    JOIN   last_msg lm ON lm.recipient_id = u.id
    LEFT JOIN unread ur ON ur.recipient_id = u.id
    WHERE  t.deleted_at IS NULL
    ORDER  BY lm.created_at DESC
  `);
  return rows;
}

/**
 * Returns every notifications_log entry for a given user (tenant),
 * oldest-first, with direction derived from status.
 */
async function findConversationThread(userId) {
  const { rows } = await query(`
    SELECT
      l.*,
      CASE WHEN l.status = 'received' THEN 'inbound' ELSE 'outbound' END AS direction
    FROM notifications_log l
    WHERE l.recipient_id = $1
    ORDER BY l.created_at ASC
  `, [userId]);
  return rows;
}

module.exports = {
  findAllTemplates,
  findTemplateById,
  findTemplateByEvent,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  findLog,
  findLogById,
  createLogEntry,
  updateLogEntry,
  findConversations,
  findConversationThread,
};
