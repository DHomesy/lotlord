const router = require('express').Router();
const express = require('express');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const stripeService = require('../services/stripeService');
const emailInboxService = require('../services/emailInboxService');
const userRepo = require('../dal/userRepository');
const notificationRepo = require('../dal/notificationRepository');
const env = require('../config/env');

// POST /api/v1/webhooks/stripe
// Raw body required — see app.js for the express.raw() middleware scoped to this path
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  try {
    const event = await stripeService.handleWebhookEvent(req.body, sig);
    res.json({ received: true, type: event.type });
  } catch (err) {
    // Invalid signature — do NOT return 500 (Stripe would retry indefinitely)
    console.error('[stripe webhook]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/v1/webhooks/twilio/sms
// Twilio posts inbound SMS here (form-encoded body, not JSON)
// express.urlencoded() is already applied globally in app.js
router.post('/twilio/sms', async (req, res) => {
  // ── 1. Validate Twilio signature ────────────────────────────────────────────
  // Only enforced when TWILIO_AUTH_TOKEN is configured (skipped in local dev)
  if (env.TWILIO_AUTH_TOKEN) {
    const authToken  = env.TWILIO_AUTH_TOKEN;
    const signature  = req.headers['x-twilio-signature'] || '';
    const webhookUrl = `${env.APP_BASE_URL}/api/v1/webhooks/twilio/sms`;

    const valid = twilio.validateRequest(authToken, signature, webhookUrl, req.body);
    if (!valid) {
      console.warn('[twilio webhook] Invalid signature — rejecting request');
      // Reply with empty TwiML rather than JSON (Twilio expects XML or 40x)
      res.type('text/xml').status(403).send('<Response></Response>');
      return;
    }
  }

  // ── 2. Parse the inbound message ────────────────────────────────────────────
  const from       = req.body.From || '';       // E.164 sender number, e.g. +14155551234
  const body       = req.body.Body || '';
  const messageSid = req.body.MessageSid || '';

  console.info(`[twilio inbound] MessageSid=${messageSid} From=${from} Body="${body}"`);

  // ── 3. Identify the sender (best-effort) ────────────────────────────────────
  // If the phone number belongs to a known user, log the message for audit.
  // Unknown senders are console-logged only (recipient_id is NOT NULL in DB).
  try {
    const sender = await userRepo.findByPhone(from);
    if (sender) {
      await notificationRepo.createLogEntry({
        id:          uuidv4(),
        templateId:  null,
        recipientId: sender.id,
        channel:     'sms',
        status:      'received',
        subject:     null,
        body,
      });
      console.info(`[twilio inbound] Matched user ${sender.id} (${sender.email})`);
    } else {
      console.warn(`[twilio inbound] Unknown sender: ${from} — message not persisted`);
    }
  } catch (err) {
    // Non-fatal — still acknowledge Twilio so they don't retry
    console.error('[twilio inbound] Error processing message:', err.message);
  }

  // ── 4. Reply with empty TwiML ────────────────────────────────────────────────
  // No auto-reply for now; the AI agent will handle conversational replies.
  res.type('text/xml').send('<Response></Response>');
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
    const secret = req.headers['x-webhook-secret'];
    if (secret !== env.SES_WEBHOOK_SECRET) {
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
    if (env.SES_WEBHOOK_SECRET && req.query.secret !== env.SES_WEBHOOK_SECRET) {
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
