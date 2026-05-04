/**
 * Email integration — AWS SES (SDK v3)
 * -------------------------------------
 * OUTBOUND:  sendEmail()    — send transactional email via SES SendEmailCommand
 * REPLY:     replyToEmail() — reply in-thread using RFC 2822 headers via SendRawEmailCommand
 *
 * Inbound flow (SES → S3 → SQS → Lambda → API):
 *   1. SES receipt rule stores raw .eml to S3 (infra/lib/email-stack.js)
 *   2. S3 event notification fires → SQS queue
 *   3. Lambda (infra/lambda/ses-inbound/index.js) parses the email and POSTs
 *      the structured payload to POST /api/v1/webhooks/ses
 *   4. emailInboxService.processInboundEmail() handles dedup + logging
 *
 * Required env vars:
 *   AWS_REGION            — e.g. us-east-1
 *   AWS_ACCESS_KEY_ID     — IAM user key (output by CDK stack)
 *   AWS_SECRET_ACCESS_KEY — IAM user secret (output by CDK stack)
 *   SES_FROM_ADDRESS      — e.g. noreply@lotlord.app
 *   SES_REPLY_TO_ADDRESS  — e.g. reply@lotlord.app  (tenants reply here)
 *   SES_CONFIGURATION_SET — e.g. lotlord-config-set (enables bounce tracking)
 */

const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const env = require('../../config/env');

// ── SES client (singleton) ────────────────────────────────────────────────────

let sesClient;

function getClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: env.AWS_REGION || 'us-east-1' });
  }
  return sesClient;
}

// ── Outbound ──────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip CR and LF from an email header value to prevent MIME header injection.
 * A crafted tenant name or property name containing \r\n could otherwise inject
 * extra headers (e.g. Bcc:, To:) into outgoing messages. (OWASP A03: Injection)
 *
 * @param {*} value - Any value; coerced to string
 * @returns {string} Value with all \r and \n characters replaced by a space
 */
function sanitizeHeader(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Wrap a base64 string at 76-character line boundaries as required by RFC 2045.
 * Some strict SMTP relays reject base64 parts that exceed this line length.
 *
 * @param {string} b64
 * @returns {string}
 */
function wrapBase64(b64) {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64;
}

// ── Outbound ──────────────────────────────────────────────────────────────────

/**
 * Send a transactional email.
 *
 * Sets Reply-To to SES_REPLY_TO_ADDRESS so tenant replies land in the
 * inbound S3 bucket rather than bouncing off noreply@.
 *
 * @param {object} opts
 * @param {string}  opts.to       Recipient address
 * @param {string}  opts.subject  Subject line
 * @param {string}  opts.html     HTML body
 * @param {string}  [opts.text]   Plain-text fallback (auto-stripped from HTML if omitted)
 */
async function sendEmail({ to, subject, html, text }) {
  const plainText = text || html.replace(/<[^>]+>/g, '');
  const boundary  = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const unsubAddr = env.SES_REPLY_TO_ADDRESS || env.SES_FROM_ADDRESS;

  // Build raw MIME so we can include RFC 2369 List-Unsubscribe headers.
  // Gmail, Outlook, and Apple Mail use these to render the one-click unsubscribe
  // option and to classify the message as transactional rather than bulk/spam.
  //
  // Header values are sanitized to strip \r\n (CRLF injection prevention).
  const headerLines = [
    `From: LotLord <${sanitizeHeader(env.SES_FROM_ADDRESS)}>`,
    `To: ${sanitizeHeader(to)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `List-Unsubscribe: <mailto:${sanitizeHeader(unsubAddr)}?subject=unsubscribe>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
  ];
  if (env.SES_REPLY_TO_ADDRESS) headerLines.push(`Reply-To: ${sanitizeHeader(env.SES_REPLY_TO_ADDRESS)}`);

  const rawMessage = [
    headerLines.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(plainText, 'utf8').toString('base64')),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(html, 'utf8').toString('base64')),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawMessage) },
    // Routes bounce/complaint events to SNS (requires config set + SNS destination)
    ConfigurationSetName: env.SES_CONFIGURATION_SET || undefined,
  });

  await getClient().send(command);
}

/**
 * Reply to an existing email conversation, preserving RFC 2822 threading headers.
 * Uses SendRawEmailCommand so we can include In-Reply-To and References.
 *
 * @param {object}  opts
 * @param {string}  opts.to          Recipient address (original sender)
 * @param {string}  opts.subject     Subject line ("Re: " is prepended if missing)
 * @param {string}  opts.html        HTML reply body
 * @param {string}  [opts.text]      Plain-text fallback
 * @param {string}  [opts.inReplyTo] Message-ID of the email being replied to
 * @param {string}  [opts.references] Space-separated chain of prior Message-IDs
 */
async function replyToEmail({ to, subject, html, text, inReplyTo, references }) {
  const safeSubject  = subject ?? '';
  const replySubject = safeSubject.startsWith('Re:') ? safeSubject : `Re: ${safeSubject}`;
  const plainText    = text || html.replace(/<[^>]+>/g, '');
  const boundary     = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headerLines = [
    `From: LotLord <${env.SES_FROM_ADDRESS}>`,
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (inReplyTo)  headerLines.push(`In-Reply-To: ${inReplyTo}`);
  if (references || inReplyTo) {
    // References chain: existing refs + the message we're replying to
    const refs = [references, inReplyTo].filter(Boolean).join(' ').trim();
    headerLines.push(`References: ${refs}`);
  }

  // Each body part is base64-encoded to handle non-ASCII characters safely
  const rawMessage = [
    headerLines.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainText, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  await getClient().send(
    new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage, 'utf8') },
      ConfigurationSetName: env.SES_CONFIGURATION_SET || undefined,
    }),
  );
}

module.exports = { sendEmail, replyToEmail };
