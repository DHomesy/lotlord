const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function createEmailEntry({
  externalId,
  fromAddress,
  toAddress,
  subject,
  bodyText,
  bodyHtml,
  inReplyTo,
  referencesHeader,
  rawPayload,
}) {
  const { rows } = await query(
    `INSERT INTO unmatched_inbound_messages
       (id, channel, external_id, from_address, to_address, subject, body_text, body_html, in_reply_to, references_header, raw_payload)
     VALUES
       ($1, 'email', $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      uuidv4(),
      externalId || null,
      fromAddress,
      toAddress || null,
      subject || null,
      bodyText || null,
      bodyHtml || null,
      inReplyTo || null,
      referencesHeader || null,
      rawPayload || null,
    ],
  );

  return rows[0] || null;
}

async function list({ status = 'open', page = 1, limit = 25 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  let where = '1=1';

  if (status) {
    where += ` AND m.status = $${values.push(status)}`;
  }

  const { rows } = await query(
    `SELECT m.*, u.email AS reviewed_by_email, u.first_name AS reviewed_by_first_name, u.last_name AS reviewed_by_last_name
     FROM unmatched_inbound_messages m
     LEFT JOIN users u ON u.id = m.reviewed_by
     WHERE ${where}
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    values,
  );

  return rows;
}

async function updateStatus(id, { status, notes, reviewedBy }) {
  const { rows } = await query(
    `UPDATE unmatched_inbound_messages
     SET status = $2,
         notes = COALESCE($3, notes),
         reviewed_by = $4,
         reviewed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, notes || null, reviewedBy || null],
  );

  return rows[0] || null;
}

module.exports = {
  createEmailEntry,
  list,
  updateStatus,
};