const { v4: uuidv4 } = require('uuid');
const notificationRepo = require('../dal/notificationRepository');
const userRepo   = require('../dal/userRepository');
const tenantRepo = require('../dal/tenantRepository');
const smsRepo = require('../dal/smsRepository');
const email = require('../integrations/email');
const { sendSms } = require('../integrations/sms');
const env = require('../config/env');
const { estimateSmsSegments } = require('../lib/smsSegments');
const { escapeHtml, renderTemplate } = require('../lib/templateUtils');

// ── Helpers ───────────────────────────────────────────────────────────────────

function notFound(msg) {
  return Object.assign(new Error(msg), { status: 404 });
}

function resolveLandlordSmsIdentity(landlord) {
  if (!landlord) return undefined;
  return landlord.aws_sms_phone_number_id || landlord.aws_sms_phone_number || undefined;
}

function getPlanSegmentCap(user) {
  const plan = user?.subscription_plan || 'free';
  const status = user?.subscription_status;

  if (!['active', 'trialing'].includes(status || '')) return 0;

  const autopilot = Number(env.SMS_CAP_AUTOPILOT || 1000);
  const portfolio = Number(env.SMS_CAP_PORTFOLIO || 2500);

  if (plan === 'portfolio') return portfolio;
  if (plan === 'autopilot') return autopilot;
  return 0;
}

async function alertSmsFailure({ error, to, from, attempts }) {
  if (!env.ALERT_EMAIL) return;
  const subject = '[LotLord] SMS delivery failed after retries';
  const text = [
    'Provider: aws',
    `Attempts: ${attempts}`,
    `To: ${to || 'unknown'}`,
    `From: ${from || 'default'}`,
    `Error: ${error?.message || 'Unknown error'}`,
  ].join('\n');

  try {
    await email.sendEmail({
      to: env.ALERT_EMAIL,
      subject,
      html: `<pre>${escapeHtml(text)}</pre>`,
      text,
    });
  } catch (notifyErr) {
    console.error('[notification] Failed to send SMS failure alert email:', notifyErr.message);
  }
}

/**
 * Resolve a user by ID — throws 404 if not found.
 */
async function resolveRecipient(recipientId) {
  const user = await userRepo.findById(recipientId);
  if (!user) throw notFound('Recipient user not found');
  if (!user.email) throw Object.assign(new Error('Recipient has no email address'), { status: 422 });
  if (user.email_bounced) {
    throw Object.assign(
      new Error(`Email delivery blocked — address <${user.email}> has previously bounced. Clear email_bounced in the users table to re-enable.`),
      { status: 422 },
    );
  }
  return user;
}

/**
 * Resolve a user by ID and assert they have a phone number.
 * Throws 404 if not found, 422 if phone is missing.
 */
async function resolveRecipientPhone(recipientId) {
  const user = await userRepo.findById(recipientId);
  if (!user) throw notFound('Recipient user not found');
  if (!user.phone) throw Object.assign(new Error('Recipient has no phone number on file'), { status: 422 });
  return user;
}

// ── Core send logic ───────────────────────────────────────────────────────────

/**
 * Internal: send an email and update the log entry status.
 */
async function executeSend({ logId, recipientEmail, subject, html, text, messageId }) {
  try {
    await email.sendEmail({ to: recipientEmail, subject, html, text, messageId });
    await notificationRepo.updateLogEntry(logId, {
      status: 'sent',
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    await notificationRepo.updateLogEntry(logId, {
      status: 'failed',
      errorMessage: err.message,
    });
    throw Object.assign(
      new Error(`Email send failed: ${err.message}`),
      { status: 502 },
    );
  }
}

/**
 * Internal: send an SMS via the configured provider and update the log entry status.
 * @param {string} [fromNumber] - E.164 sender override (landlord's number). Defaults to platform number.
 */
async function executeSendSms({ logId, to, body, fromNumber }) {
  const attempts = Number(env.SMS_SEND_MAX_ATTEMPTS || 3);
  let lastErr;

  for (let i = 1; i <= attempts; i++) {
    try {
      const providerMessageId = await sendSms({ to, body, from: fromNumber });
      await notificationRepo.updateLogEntry(logId, {
        status: 'sent',
        sentAt: new Date().toISOString(),
      });
      return providerMessageId;
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.warn(`[notification] SMS attempt ${i}/${attempts} failed (${err.message}). Retrying...`);
      }
    }
  }

  await notificationRepo.updateLogEntry(logId, {
    status: 'failed',
    errorMessage: lastErr?.message || 'Unknown SMS failure',
  });
  await alertSmsFailure({ error: lastErr, to, from: fromNumber, attempts });
  throw Object.assign(
    new Error(`SMS send failed: ${lastErr?.message || 'Unknown error'}`),
    { status: 502 },
  );
}

// ── Public service methods ────────────────────────────────────────────────────

/**
 * Send an ad-hoc email to a user by their ID.
 * Subject and HTML body are provided directly — no template involved.
 *
 * @param {object} opts
 * @param {string} opts.recipientId  - UUID of the user to send to
 * @param {string} opts.subject      - Email subject line
 * @param {string} opts.html         - HTML body
 * @param {string} [opts.text]       - Optional plain-text fallback
 * @returns {Promise<object>}        - The notifications_log row
 */
async function sendAdhoc({ recipientId, subject, html, text, messageId }) {
  const recipient = await resolveRecipient(recipientId);

  const logEntry = await notificationRepo.createLogEntry({
    id: uuidv4(),
    templateId: null,
    recipientId,
    channel: 'email',
    status: 'queued',
    subject,
    body: html,
  });

  await executeSend({ logId: logEntry.id, recipientEmail: recipient.email, subject, html, text, messageId });
  return notificationRepo.findLogById(logEntry.id);
}

/**
 * Render a saved template with the given variables and send it to a user.
 *
 * @param {object} opts
 * @param {string}  opts.templateId   - UUID of the notification_template
 * @param {string}  opts.recipientId  - UUID of the recipient user
 * @param {object}  [opts.variables]  - Key/value pairs for {{placeholder}} substitution
 * @returns {Promise<object>}         - The notifications_log row
 */
async function sendFromTemplate({ templateId, recipientId, variables = {}, fromNumber, landlordId }) {
  if (!templateId) throw Object.assign(new Error('templateId is required'), { status: 400 });

  const template = await notificationRepo.findTemplateById(templateId);
  if (!template) throw notFound('Notification template not found');

  // ── SMS channel ───────────────────────────────────────────────────────────
  if (template.channel === 'sms') {
    if (landlordId) {
      const tenant = await tenantRepo.findByUserId(recipientId);
      if (tenant) {
        const pref = await smsRepo.getTenantOwnerPreference(tenant.id, landlordId);
        if (pref && pref.sms_opt_in === false) {
          throw Object.assign(new Error('Recipient has opted out of SMS for this landlord'), { status: 409, code: 'SMS_OPTED_OUT' });
        }
      }
    }

    const recipient = await resolveRecipientPhone(recipientId);
    const renderedBody = renderTemplate(template.body_template, variables, 'sms');
    const smsSegments = estimateSmsSegments(renderedBody);

    const logEntry = await notificationRepo.createLogEntry({
      id: uuidv4(),
      templateId,
      recipientId,
      channel: 'sms',
      status: 'queued',
      subject: null,
      body: renderedBody,
      smsSegments,
    });

    await executeSendSms({ logId: logEntry.id, to: recipient.phone, body: renderedBody, fromNumber });
    if (landlordId) {
      await smsRepo.incrementMonthlyUsage({ ownerId: landlordId, segments: estimateSmsSegments(renderedBody) });
    }
    return notificationRepo.findLogById(logEntry.id);
  }

  // ── Email channel (default) ───────────────────────────────────────────────
  const recipient = await resolveRecipient(recipientId);
  const renderedSubject = renderTemplate(template.subject || '(no subject)', variables, 'email');
  const renderedBody    = renderTemplate(template.body_template, variables, 'email');

  const logEntry = await notificationRepo.createLogEntry({
    id: uuidv4(),
    templateId,
    recipientId,
    channel: 'email',
    status: 'queued',
    subject: renderedSubject,
    body: renderedBody,
  });

  await executeSend({
    logId: logEntry.id,
    recipientEmail: recipient.email,
    subject: renderedSubject,
    html: renderedBody,
  });

  return notificationRepo.findLogById(logEntry.id);
}

/**
 * Used by scheduled jobs and controllers.
 * Looks up a template by trigger_event + channel, renders it, and sends.
 * Silently skips if no matching template exists — lets jobs run before templates are created.
 *
 * @param {object}  opts
 * @param {string}  opts.triggerEvent  e.g. 'rent_due', 'lease_expiring'
 * @param {string}  opts.recipientId   UUID of the recipient user
 * @param {object}  [opts.variables]   Template placeholder substitutions
 * @param {string}  [opts.channel]     'email' (default) or 'sms'
 * @returns {Promise<object|null>}     notifications_log row, or null if no template found
 */
async function sendByTriggerEvent({ triggerEvent, recipientId, variables = {}, channel = 'email', landlordId }) {
  const template = await notificationRepo.findTemplateByEvent(triggerEvent, channel);
  if (!template) {
    console.warn(`[notification] No ${channel} template for trigger_event='${triggerEvent}' — skipping recipient ${recipientId}`);
    return null;
  }
  // Merge in global defaults so every template can use {{portal_url}} without
  // each job/caller needing to pass it explicitly. Caller-supplied values win.
  if (!env.FRONTEND_URL) {
    console.warn('[notification] FRONTEND_URL env var is not set — portal links in email templates will be broken');
  }
  const mergedVariables = { portal_url: env.FRONTEND_URL || '', ...variables };

  // Resolve the landlord's provisioned SMS number for outbound SMS routing.
  // If no number is provisioned, falls back to the platform number (handled in sendSms).
  let fromNumber;
  if (channel === 'sms' && landlordId) {
    const landlord = await userRepo.findById(landlordId);
    fromNumber = resolveLandlordSmsIdentity(landlord);
  }

  return sendFromTemplate({ templateId: template.id, recipientId, variables: mergedVariables, fromNumber, landlordId });
}

/**
 * Send an ad-hoc SMS to a user by their ID.
 * Body is provided directly — no template involved.
 *
 * @param {object} opts
 * @param {string} opts.recipientId  UUID of the user to text
 * @param {string} opts.body         SMS message body (max ~1600 chars; 160 per segment)
 * @returns {Promise<object>}        The notifications_log row
 */
async function sendSmsAdhoc({ recipientId, body, landlordId }) {
  if (landlordId) {
    const tenant = await tenantRepo.findByUserId(recipientId);
    if (tenant) {
      const pref = await smsRepo.getTenantOwnerPreference(tenant.id, landlordId);
      if (pref && pref.sms_opt_in === false) {
        throw Object.assign(new Error('Recipient has opted out of SMS for this landlord'), { status: 409, code: 'SMS_OPTED_OUT' });
      }
    }
  }

  const recipient = await resolveRecipientPhone(recipientId);
  const smsSegments = estimateSmsSegments(body);

  // Resolve the landlord's provisioned number so the message arrives from their personal line.
  let fromNumber;
  if (landlordId) {
    const landlord = await userRepo.findById(landlordId);
    fromNumber = resolveLandlordSmsIdentity(landlord);
  }

  const logEntry = await notificationRepo.createLogEntry({
    id: uuidv4(),
    templateId: null,
    recipientId,
    channel: 'sms',
    status: 'queued',
    subject: null,
    body,
    smsSegments,
  });

  await executeSendSms({ logId: logEntry.id, to: recipient.phone, body, fromNumber });
  if (landlordId) {
    await smsRepo.incrementMonthlyUsage({ ownerId: landlordId, segments: estimateSmsSegments(body) });
  }
  return notificationRepo.findLogById(logEntry.id);
}

/**
 * Guardrail check for AI auto-send SMS behavior.
 * Over-cap should switch to approval-only mode (auto-send blocked).
 */
async function canAutoSendSmsForOwner({ ownerId, body }) {
  if (!ownerId) return { allowed: true, reason: null };

  const owner = await userRepo.findById(ownerId);
  const cap = getPlanSegmentCap(owner);
  const segments = estimateSmsSegments(body);

  if (cap <= 0) {
    return { allowed: false, reason: 'plan_not_eligible', segments, cap, used: null };
  }

  const warnThreshold = Number(env.SMS_AI_WARN_SEGMENTS || 3);
  const hardThreshold = Number(env.SMS_AI_BLOCK_SEGMENTS || 6);
  if (segments > hardThreshold) {
    return { allowed: false, reason: 'length_limit_exceeded', segments, cap, used: null, warnThreshold, hardThreshold };
  }

  const usage = await smsRepo.getMonthlyUsage(ownerId);
  const used = Number(usage?.segments_used || 0);

  if (cap > 0 && (used + segments) > cap) {
    return { allowed: false, reason: 'plan_cap_reached', segments, cap, used, warnThreshold, hardThreshold };
  }

  return { allowed: true, reason: null, segments, cap, used, warnThreshold, hardThreshold };
}

/**
 * Fire a trigger-event notification on ALL configured channels (email + SMS) in parallel.
 * Each channel is attempted independently — a missing template silently skips that channel.
 * SMS failures are logged but do NOT cause the email result to be discarded.
 *
 * Use this in cron jobs to send both email and SMS reminders with a single call.
 *
 * @returns {Promise<object|null>}  The email channel result (null if email template missing)
 */
async function sendAllChannels({ triggerEvent, recipientId, variables = {}, landlordId }) {
  const [emailResult, smsResult] = await Promise.allSettled([
    sendByTriggerEvent({ triggerEvent, recipientId, variables, channel: 'email' }),
    sendByTriggerEvent({ triggerEvent, recipientId, variables, channel: 'sms', landlordId }),
  ]);

  if (smsResult.status === 'rejected') {
    console.error(
      `[notification] SMS channel failed for trigger_event='${triggerEvent}' recipient=${recipientId}:`,
      smsResult.reason?.message,
    );
  }

  // Preserve existing job behavior: throw on email failure, return null on no-template
  if (emailResult.status === 'rejected') throw emailResult.reason;
  return emailResult.value;
}

// ── Templates ─────────────────────────────────────────────────────────────────

async function listTemplates({ channel, triggerEvent, page, limit } = {}) {
  return notificationRepo.findAllTemplates({ channel, triggerEvent, page, limit });
}

async function getTemplate(id) {
  const template = await notificationRepo.findTemplateById(id);
  if (!template) throw notFound('Notification template not found');
  return template;
}

async function createTemplate({ name, channel, triggerEvent, subject, bodyTemplate }) {
  return notificationRepo.createTemplate({
    id: uuidv4(),
    name,
    channel,
    triggerEvent,
    subject,
    bodyTemplate,
  });
}

async function updateTemplate(id, data) {
  await getTemplate(id);
  const updated = await notificationRepo.updateTemplate(id, data);
  if (!updated) throw Object.assign(new Error('No valid fields to update'), { status: 400 });
  return updated;
}

async function deleteTemplate(id) {
  await getTemplate(id); // 404 if not found
  const deleted = await notificationRepo.deleteTemplate(id);
  if (!deleted) throw Object.assign(new Error('Delete failed'), { status: 500 });
}

// ── Conversations ─────────────────────────────────────────────────────────────

/**
/**
 * List all tenants we have ever sent or received a message from/to,
 * with the most recent message summary per tenant.
 * @param {string|null} ownerId  null = admin (all), UUID = landlord/employee employer
 */
async function getConversations(ownerId = null) {
  return notificationRepo.findConversations(ownerId);
}

/**
 * Full message thread for a specific tenant (by tenantId).
 * Looks up the tenant's user_id, then fetches all log entries for that user.
 * Verifies the tenant belongs to ownerId's properties when ownerId is provided.
 */
async function getConversation(tenantId, ownerId = null) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw notFound('Tenant not found');
  // Scope check for landlord/employee callers
  if (ownerId) {
    const owned = await notificationRepo.tenantBelongsToOwner(tenantId, ownerId);
    if (!owned) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const messages = await notificationRepo.findConversationThread(tenant.user_id);
  return { tenant, messages };
}

/**
 * Admin-composed message to a tenant.
 * Sends via all channels the tenant has opted in to.
 * Throws 422 if the tenant has opted out of all channels.
 *
 * @param {object} opts
 * @param {string} opts.tenantId  Tenant UUID
 * @param {string} opts.subject   Message subject (used for email only)
 * @param {string} opts.body      Plain-text message body
 * @param {string} opts.senderId  Admin user UUID (for audit)
 * @returns {Promise<object[]>}   Array of notifications_log entries sent
 */
async function sendMessage({ tenantId, subject, body, senderId }) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw notFound('Tenant not found');

  if (!tenant.email_opt_in && !tenant.sms_opt_in) {
    throw Object.assign(
      new Error('This tenant has not opted in to any notification channel. They must update their preferences first.'),
      { status: 422 },
    );
  }

  const user = await userRepo.findById(tenant.user_id);
  if (!user) throw notFound('Tenant user account not found');

  // One thread_id ties the outbound message(s) together so replies thread back in
  const threadId = uuidv4();
  const results  = [];

  // ── Email channel ──────────────────────────────────────────────────────────
  if (tenant.email_opt_in && user.email && !user.email_bounced) {
    const logEntry = await notificationRepo.createLogEntry({
      id:          uuidv4(),
      templateId:  null,
      recipientId: user.id,
      channel:     'email',
      status:      'queued',
      subject:     subject || '(no subject)',
      body,
      threadId,
    });
    try {
      await email.sendEmail({ to: user.email, subject: subject || '(no subject)', html: body, text: body });
      await notificationRepo.updateLogEntry(logEntry.id, { status: 'sent', sentAt: new Date().toISOString() });
    } catch (err) {
      await notificationRepo.updateLogEntry(logEntry.id, { status: 'failed', errorMessage: err.message });
    }
    results.push(await notificationRepo.findLogById(logEntry.id));
  }

  // ── SMS channel ────────────────────────────────────────────────────────────
  if (tenant.sms_opt_in && user.phone) {
    const logEntry = await notificationRepo.createLogEntry({
      id:          uuidv4(),
      templateId:  null,
      recipientId: user.id,
      channel:     'sms',
      status:      'queued',
      subject:     null,
      body,
      threadId,
    });
    try {
      await sendSms({ to: user.phone, body });
      await notificationRepo.updateLogEntry(logEntry.id, { status: 'sent', sentAt: new Date().toISOString() });
    } catch (err) {
      await notificationRepo.updateLogEntry(logEntry.id, { status: 'failed', errorMessage: err.message });
    }
    results.push(await notificationRepo.findLogById(logEntry.id));
  }

  if (results.length === 0) {
    throw Object.assign(
      new Error('Tenant is opted in but has no email address or phone number on file.'),
      { status: 422 },
    );
  }

  return results;
}

// ── Log ───────────────────────────────────────────────────────────────────────

async function getLog({ recipientId, channel, status, page, limit, ownerId = null } = {}) {
  return notificationRepo.findLog({ recipientId, channel, status, page, limit, ownerId });
}

async function getLogEntry(id) {
  const entry = await notificationRepo.findLogById(id);
  if (!entry) throw notFound('Log entry not found');
  return entry;
}

module.exports = {
  renderTemplate,
  sendAdhoc,
  sendSmsAdhoc,
  sendFromTemplate,
  sendByTriggerEvent,
  sendAllChannels,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getConversations,
  getConversation,
  sendMessage,
  getLog,
  getLogEntry,
  canAutoSendSmsForOwner,
};
