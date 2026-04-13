/**
 * Email Inbox Service
 * -------------------
 * Processes inbound emails forwarded by the SES inbound Lambda.
 *
 * Entry point: processInboundEmail(parsedMsg)
 *   Called by POST /api/v1/webhooks/ses after the Lambda reads the raw .eml
 *   from S3, parses it with mailparser, and POSTs the structured payload here.
 *
 * Responsibilities:
 *   1. Deduplicate — skip messages already in notifications_log.external_id.
 *   2. Match sender email to a known user.
 *   3. Log to notifications_log (channel='email', status='received').
 *   4. Expose a hook point for the AI agent.
 *
 * Schema columns used from notifications_log:
 *   external_id  — RFC 2822 Message-ID (UNIQUE, prevents double-processing retried webhooks)
 *   thread_id    — In-Reply-To Message-ID (groups replies in the same conversation)
 *   channel      — 'email'
 *   status       — 'received'
 *   body         — plain-text content of the email
 *   subject      — email subject line
 *   recipient_id — the matched user's UUID (required NOT NULL; unknown senders are skipped)
 */

const { v4: uuidv4 }      = require('uuid');
const { query }            = require('../config/db');
const userRepo             = require('../dal/userRepository');
const notificationRepo     = require('../dal/notificationRepository');

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Returns true if this Message-ID has already been processed.
 * Uses the UNIQUE external_id column to guard against retried Lambda invocations.
 */
async function isAlreadyProcessed(messageId) {
  const { rows } = await query(
    'SELECT id FROM notifications_log WHERE external_id = $1 LIMIT 1',
    [messageId],
  );
  return rows.length > 0;
}

// ── Core processor ────────────────────────────────────────────────────────────

/**
 * Process a single inbound email forwarded by the SES Lambda.
 *
 * @param {object}  msg
 * @param {string}  msg.messageId   RFC 2822 Message-ID header value
 * @param {string}  msg.fromEmail   Sender's bare email address
 * @param {string}  msg.from        Full From header (e.g. "Name <email>")
 * @param {string}  msg.subject     Subject line
 * @param {string}  msg.text        Plain-text body
 * @param {string}  [msg.html]      HTML body (may be empty)
 * @param {string}  [msg.inReplyTo] In-Reply-To header (used as thread_id for grouping)
 * @returns {Promise<object|null>}  The notifications_log row, or null if skipped
 */
async function processInboundEmail(msg) {
  // 1. Dedup — skip if we already handled this exact message
  if (await isAlreadyProcessed(msg.messageId)) {
    console.info(`[emailInbox] Already processed messageId=${msg.messageId} — skipping`);
    return null;
  }

  // 2. Match sender to a known user
  const sender = await userRepo.findByEmail(msg.fromEmail);
  if (!sender) {
    console.warn(
      `[emailInbox] Unknown sender <${msg.fromEmail}> (messageId=${msg.messageId}) — not logged`,
    );
    return null;
  }

  // 3. Log to notifications_log
  const logEntry = await notificationRepo.createLogEntry({
    id:          uuidv4(),
    templateId:  null,
    recipientId: sender.id,
    channel:     'email',
    status:      'received',
    subject:     msg.subject || '(no subject)',
    body:        msg.text || msg.html || '',
    externalId:  msg.messageId,
    // thread_id groups replies — use In-Reply-To as the thread anchor
    threadId:    msg.inReplyTo || null,
  });

  console.info(
    `[emailInbox] Logged inbound email from <${msg.fromEmail}> ` +
    `(userId=${sender.id}) subject="${msg.subject}" messageId=${msg.messageId}`,
  );

  // 4. AI agent hook — will be wired up in the AI agent feature
  // await aiService.handleInboundEmail({ logEntry, msg, sender });

  return logEntry;
}

module.exports = { processInboundEmail };
