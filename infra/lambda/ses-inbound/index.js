/**
 * SES Inbound Email Processor — Lambda
 * -------------------------------------
 * Triggered by SQS, which is notified by S3 whenever SES stores a new
 * inbound email object (prefix: emails/).
 *
 * Flow:
 *   1. Parse the S3 event from the SQS message body
 *   2. Fetch the raw .eml file from S3
 *   3. Parse the MIME email with mailparser
 *   4. POST the structured payload to the API webhook
 *
 * Conversation threading (F2):
 *   The `inReplyTo` field is forwarded verbatim from the parsed email.
 *   Outbound conversation emails carry Message-ID: <conv-<uuid>-<ts>@domain>
 *   so a tenant reply will have In-Reply-To set to that value. The API's
 *   emailInboxService extracts the conversationId from it for direct routing.
 *
 * Environment variables (set by CDK):
 *   API_URL         — Base URL of the API server, e.g. https://your-app.railway.app
 *   WEBHOOK_SECRET  — Shared secret verified by POST /api/v1/webhooks/ses
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { simpleParser } = require('mailparser');

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

function buildSesWebhookUrl(apiUrlRaw) {
  const base = String(apiUrlRaw || '').trim();
  if (!base) throw new Error('API_URL environment variable is not set');

  const url = new URL(base);
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  // Accept either base URL (https://api.example.com) or /api/v1-suffixed input.
  const pathWithoutApiV1 = normalizedPath.endsWith('/api/v1')
    ? normalizedPath.slice(0, -('/api/v1'.length))
    : normalizedPath;
  const finalPath = `${pathWithoutApiV1}/api/v1/webhooks/ses`.replace(/\/{2,}/g, '/');

  url.pathname = finalPath;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/**
 * @param {import('aws-lambda').SQSEvent} event
 * @returns {Promise<import('aws-lambda').SQSBatchResponse>}
 */
exports.handler = async (event) => {
  const batchItemFailures = [];

  for (const sqsRecord of event.Records) {
    try {
      // The SQS message body is an S3 event notification JSON
      const s3Event = JSON.parse(sqsRecord.body);

      for (const s3Record of s3Event.Records ?? []) {
        const bucket = s3Record.s3.bucket.name;
        // S3 URI-encodes the key; + must be decoded as space
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));

        await processEmailObject(bucket, key);
      }
    } catch (err) {
      console.error(`[ses-inbound] Failed to process SQS record ${sqsRecord.messageId}:`, err.message);
      // Report as a batch item failure so only this message is put on the DLQ,
      // not the entire batch
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};

/**
 * Fetch an email from S3, parse it, and forward to the API.
 * @param {string} bucket
 * @param {string} key
 */
async function processEmailObject(bucket, key) {
  // 1. Fetch raw .eml from S3
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const rawEmail = await streamToBuffer(obj.Body);

  // 2. Parse MIME
  const parsed = await simpleParser(rawEmail);

  // Guard: skip if there is no identifiable sender
  const fromAddress = parsed.from?.value?.[0]?.address;
  if (!fromAddress) {
    console.warn(`[ses-inbound] No From address in email — key=${key}, skipping`);
    return;
  }

  // 3. Build the payload the API expects
  const payload = {
    messageId:  parsed.messageId ?? key,           // fall back to S3 key as dedup ID
    fromEmail:  fromAddress,
    from:       parsed.from?.text ?? fromAddress,
    to:         parsed.to?.text ?? '',
    subject:    parsed.subject ?? '(no subject)',
    text:       parsed.text?.trim() ?? '',
    html:       typeof parsed.html === 'string' ? parsed.html.trim() : '',
    inReplyTo:  parsed.inReplyTo ?? null,
    references: Array.isArray(parsed.references)
      ? parsed.references.join(' ')
      : (parsed.references ?? null),
    date:       parsed.date?.toISOString() ?? null,
  };

  // 4. POST to API webhook
  const apiUrl       = process.env.API_URL;
  const secret       = process.env.WEBHOOK_SECRET;

  const webhookUrl = buildSesWebhookUrl(apiUrl);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-webhook-secret': secret ?? '',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API responded ${response.status} at ${webhookUrl}: ${body}`);
  }

  console.info(
    `[ses-inbound] Forwarded email key=${key} ` +
    `from=${fromAddress} subject="${payload.subject}"`,
  );
}

/**
 * Drain a Node.js readable stream into a Buffer.
 * @param {import('stream').Readable} stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
