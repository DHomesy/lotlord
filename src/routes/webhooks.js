const router = require('express').Router();
const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const stripeService = require('../services/stripeService');
const emailInboxService = require('../services/emailInboxService');
const conversationService = require('../services/conversationService');
const userRepo = require('../dal/userRepository');
const tenantRepo = require('../dal/tenantRepository');
const smsRepo = require('../dal/smsRepository');
const notificationRepo = require('../dal/notificationRepository');
const env = require('../config/env');

/**
 * Constant-time secret comparison — prevents timing-based brute-force of webhook secrets.
 * Returns false (rather than throwing) when lengths differ so callers just reject.
 */
function safeCompare(a, b) {
  try {
    const bA = Buffer.from(String(a));
    const bB = Buffer.from(String(b));
    if (bA.length !== bB.length) return false;
    return crypto.timingSafeEqual(bA, bB);
  } catch {
    return false;
  }
}

function normalizePhone(value) {
  return String(value || '').trim();
}

function isStopKeyword(text) {
  const value = String(text || '').trim().toUpperCase();
  return ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(value);
}

function isStartKeyword(text) {
  const value = String(text || '').trim().toUpperCase();
  return ['START', 'UNSTOP', 'YES'].includes(value);
}

function isHelpKeyword(text) {
  return String(text || '').trim().toUpperCase() === 'HELP';
}

function parseAwsInboundBody(payload = {}) {
  // Shape 1: direct payload (forwarder)
  // Shape 2: EventBridge style payload.detail
  // Shape 3: SNS HTTP envelope where Message is a JSON string
  const detail = payload.detail || payload;

  const snsMessage = (payload.Type === 'Notification' && typeof payload.Message === 'string')
    ? (() => {
      try { return JSON.parse(payload.Message); } catch { return null; }
    })()
    : null;

  const source = snsMessage || detail;

  const from = source?.originationNumber || source?.from || source?.sourcePhoneNumber || '';
  const to = source?.destinationNumber || source?.to || source?.destinationPhoneNumber || '';
  const body = source?.messageBody || source?.body || source?.message || '';
  const messageId = source?.messageId || source?.inboundMessageId || source?.id || payload.id || '';

  return { from, to, body, messageId };
}

async function processInboundSms({ provider, from, to, body, externalId }) {
  const senderPhone = normalizePhone(from);
  const destinationPhone = normalizePhone(to);

  if (!senderPhone || !destinationPhone) {
    console.warn(`[${provider} inbound] Missing sender/destination phone — ignoring`);
    return;
  }

  if (externalId) {
    const existing = await notificationRepo.findLogByExternalId(externalId);
    if (existing) {
      console.info(`[${provider} inbound] Duplicate externalId=${externalId} ignored`);
      return;
    }
  }

  const [sender, landlord] = await Promise.all([
    userRepo.findByPhone(senderPhone),
    userRepo.findByAwsSmsNumber(destinationPhone),
  ]);

  if (!sender) {
    console.warn(`[${provider} inbound] Unknown sender: ${senderPhone} — message not persisted`);
    return;
  }

  if (!landlord) {
    console.warn(`[${provider} inbound] No landlord found for destination ${destinationPhone}`);
  }

  const logEntry = await notificationRepo.createLogEntry({
    id: uuidv4(),
    templateId: null,
    recipientId: sender.id,
    channel: 'sms',
    status: 'received',
    subject: null,
    body,
    externalId: externalId || null,
  });

  // Compliance keyword handling (landlord-scoped preferences)
  if (landlord?.id) {
    try {
      const tenantRecord = await tenantRepo.findByUserId(sender.id);
      const tenantId = tenantRecord?.id || null;
      if (isStopKeyword(body)) {
        if (tenantId) {
          await smsRepo.upsertTenantOwnerPreference({ tenantId, ownerId: landlord.id, smsOptIn: false });
        }
        await smsRepo.logConsentEvent({
          tenantId,
          ownerId: landlord.id,
          eventType: 'opt_out',
          messageId: externalId || null,
          metadata: { provider, from: senderPhone, to: destinationPhone },
        });
        return;
      }
      if (isStartKeyword(body)) {
        if (tenantId) {
          await smsRepo.upsertTenantOwnerPreference({ tenantId, ownerId: landlord.id, smsOptIn: true });
        }
        await smsRepo.logConsentEvent({
          tenantId,
          ownerId: landlord.id,
          eventType: 'start',
          messageId: externalId || null,
          metadata: { provider, from: senderPhone, to: destinationPhone },
        });
      } else if (isHelpKeyword(body)) {
        await smsRepo.logConsentEvent({
          tenantId,
          ownerId: landlord.id,
          eventType: 'help',
          messageId: externalId || null,
          metadata: { provider, from: senderPhone, to: destinationPhone },
        });
      }
    } catch (err) {
      console.error(`[${provider} inbound] Failed compliance event handling:`, err.message);
    }
  }

  conversationService.handleInboundSms({
    tenantUserId: sender.id,
    landlordId: landlord?.id ?? null,
    content: body,
    logEntryId: logEntry.id,
    channel: 'sms',
  }).catch((err) => console.error(`[${provider}] AI handling failed:`, err.message));
}

// POST /api/v1/webhooks/stripe
// Raw body required — see app.js for the express.raw() middleware scoped to this path
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    // constructWebhookEvent throws a SignatureVerificationError on bad signature
    event = await stripeService.handleWebhookEvent(req.body, sig);
  } catch (err) {
    if (err?.type === 'StripeSignatureVerificationError') {
      // Stripe should NOT retry on a bad signature — return 400
      console.error('[stripe webhook] Invalid signature:', err.message);
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }
    // Any other error (DB failure, coding error) → 500 so Stripe retries
    console.error('[stripe webhook] Handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.json({ received: true, type: event.type });
});

// POST /api/v1/webhooks/aws/sms
// Supports:
// - AWS SNS HTTP envelope (Type=Notification, Message=<JSON string>)
// - AWS EventBridge/Lambda forwarder JSON payloads
router.post('/aws/sms', async (req, res) => {
  if (env.NODE_ENV === 'production' && !env.AWS_SMS_WEBHOOK_SECRET) {
    console.error('[aws sms webhook] AWS_SMS_WEBHOOK_SECRET must be configured in production');
    return res.status(500).json({ error: 'AWS SMS webhook is not configured' });
  }

  if (env.AWS_SMS_WEBHOOK_SECRET) {
    const secret = req.headers['x-webhook-secret'] || req.query.secret || '';
    if (!safeCompare(secret, env.AWS_SMS_WEBHOOK_SECRET)) {
      console.warn('[aws sms webhook] Invalid webhook secret — rejecting request');
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  const payload = req.body || {};

  // Handle SNS subscription handshake when endpoint is subscribed directly.
  if (payload.Type === 'SubscriptionConfirmation' && payload.SubscribeURL) {
    try {
      const subscribeHost = new URL(payload.SubscribeURL).hostname;
      if (!subscribeHost.endsWith('.amazonaws.com') && !subscribeHost.endsWith('.amazonaws.com.cn')) {
        console.warn(`[aws sms webhook] SubscribeURL host '${subscribeHost}' is not an AWS endpoint — refusing to confirm`);
        return res.sendStatus(200);
      }

      await fetch(payload.SubscribeURL);
      console.info('[aws sms webhook] SNS subscription confirmed');
    } catch (err) {
      console.error('[aws sms webhook] Failed to confirm SNS subscription:', err.message);
    }
    return res.sendStatus(200);
  }

  const { from, to, body, messageId } = parseAwsInboundBody(payload);

  // Always ACK quickly to avoid upstream retries on transient processing issues.
  res.sendStatus(200);

  processInboundSms({ provider: 'aws', from, to, body, externalId: messageId })
    .catch((err) => console.error('[aws sms webhook] Error processing message:', err.message));
});

// POST /api/v1/webhooks/ses
// Receives parsed inbound emails forwarded by the SES Lambda.
// The Lambda reads the raw .eml from S3, parses it with mailparser, and POSTs here.
//
// Authentication: x-webhook-secret header must match SES_WEBHOOK_SECRET.
// Secret is set on the Lambda via the CDK stack (infra/lib/email-stack.js).
router.post('/ses', async (req, res) => {
  // ── 1. Verify webhook secret ──────────────────────────────────────────────────
  // Skipped if SES_WEBHOOK_SECRET is not configured (allows local dev testing via Postman)
  if (env.SES_WEBHOOK_SECRET) {
    const secret = req.headers['x-webhook-secret'] || '';
    if (!safeCompare(secret, env.SES_WEBHOOK_SECRET)) {
      console.warn('[ses webhook] Invalid webhook secret — rejecting request');
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  // ── 2. Validate minimum payload ───────────────────────────────────────────────
  const msg = req.body;
  if (!msg?.messageId || !msg?.fromEmail) {
    console.warn('[ses webhook] Missing messageId or fromEmail in payload — ignoring');
    return res.sendStatus(400);
  }

  // ── 3. Acknowledge immediately, process asynchronously ───────────────────────
  // Lambda waits for a 2xx — respond fast and do work in background
  res.sendStatus(200);

  emailInboxService.processInboundEmail(msg).catch(err =>
    console.error('[ses webhook] processInboundEmail failed:', err.message),
  );
});

// POST /api/v1/webhooks/ses/bounce
// Receives SES bounce and complaint notifications from AWS SNS.
//
// SNS sends two message types:
//   SubscriptionConfirmation — sent once after CDK deploys; auto-confirmed here
//   Notification             — bounce or complaint event; marks affected address in DB
//
// SNS delivers with Content-Type: text/plain so we parse the body as JSON manually.
// Authentication: ?secret= query param must match SES_WEBHOOK_SECRET (set via CDK subscription URL).
router.post('/ses/bounce', express.json({ type: '*/*', limit: '64kb' }), async (req, res) => {
  // Always 200 immediately — SNS retries on any non-2xx response
  res.sendStatus(200);

  try {
    // ── Secret guard ──────────────────────────────────────────────────────────
    // The CDK stack includes ?secret=<SES_WEBHOOK_SECRET> in the SNS subscription URL.
    // This prevents unauthenticated callers from triggering markEmailBounced on arbitrary addresses.
    if (env.SES_WEBHOOK_SECRET && !safeCompare(req.query.secret || '', env.SES_WEBHOOK_SECRET)) {
      console.warn('[ses/bounce] Invalid or missing secret query param — ignoring notification');
      return;
    }

    const snsMessage = req.body;
    if (!snsMessage?.Type) {
      console.warn('[ses/bounce] Missing SNS Type field — ignoring');
      return;
    }

    // ── Auto-confirm SNS subscription ─────────────────────────────────────────
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      if (!snsMessage.SubscribeURL) return;

      // SSRF guard — only follow subscription confirmation URLs from AWS SNS endpoints.
      // Reject anything that doesn't originate from *.amazonaws.com to prevent an
      // unauthenticated caller from forcing the server to make arbitrary HTTP requests.
      try {
        const subscribeHost = new URL(snsMessage.SubscribeURL).hostname;
        if (!subscribeHost.endsWith('.amazonaws.com') && !subscribeHost.endsWith('.amazonaws.com.cn')) {
          console.warn(`[ses/bounce] SubscribeURL host '${subscribeHost}' is not an AWS endpoint — refusing to confirm`);
          return;
        }
      } catch {
        console.warn('[ses/bounce] SubscribeURL is not a valid URL — refusing to confirm');
        return;
      }

      console.info('[ses/bounce] Confirming SNS subscription...');
      await fetch(snsMessage.SubscribeURL);
      console.info('[ses/bounce] SNS subscription confirmed');
      return;
    }

    if (snsMessage.Type !== 'Notification') return;

    // ── Parse the inner SES notification ──────────────────────────────────────
    const notification = JSON.parse(snsMessage.Message);
    const notifType    = notification.notificationType; // 'Bounce' | 'Complaint'

    let bouncedAddresses = [];

    if (notifType === 'Bounce') {
      bouncedAddresses = (notification.bounce?.bouncedRecipients ?? []).map(r => r.emailAddress);
    } else if (notifType === 'Complaint') {
      bouncedAddresses = (notification.complaint?.complainedRecipients ?? []).map(r => r.emailAddress);
    } else {
      return; // Delivery or other notification types — no action needed
    }

    for (const address of bouncedAddresses) {
      try {
        await userRepo.markEmailBounced(address);
        console.warn(`[ses/bounce] Marked email_bounced for <${address}> (${notifType})`);
      } catch (err) {
        console.error(`[ses/bounce] Failed to mark bounce for <${address}>:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ses/bounce] Error processing SNS notification:', err.message);
  }
});

module.exports = router;
