const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findByEmail(email) {
  const { rows } = await query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, email, role, first_name, last_name, phone, avatar_url,
            email_bounced, email_bounced_at, email_verified_at, token_version,
            employer_id, created_at,
            twilio_sms_number, twilio_messaging_service_sid,
            ai_enabled, ai_reply_mode, ai_notify_on_send, ai_notify_channels
     FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ id, email, passwordHash, role, firstName, lastName, phone, acceptedTermsAt, employerId = null }, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const { rows } = await fn(
    `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone, accepted_terms_at, employer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, email, role, first_name, last_name, phone, accepted_terms_at, email_verified_at, token_version, employer_id, created_at`,
    [id, email, passwordHash, role || 'tenant', firstName, lastName, phone || null, acceptedTermsAt || null, employerId],
  );
  return rows[0];
}

async function updatePassword(userId, passwordHash) {
  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
    [passwordHash, userId],
  );
}

async function incrementTokenVersion(userId) {
  await query(
    `UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
}

async function update(id, fields) {
  // Build a dynamic SET clause from only the supplied fields
  const allowed = [
    'first_name', 'last_name', 'phone', 'avatar_url',
    // AI config — updated via PATCH /api/v1/users/me from the profile page
    'ai_enabled', 'ai_reply_mode', 'ai_notify_on_send', 'ai_notify_channels',
  ];
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
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL
     RETURNING id, email, role, first_name, last_name, phone, avatar_url,
               ai_enabled, ai_reply_mode, ai_notify_on_send, ai_notify_channels,
               twilio_sms_number`,
    values,
  );
  return rows[0] || null;
}

async function findAll({ page = 1, limit = 20, role } = {}) {
  const { limit: limitNum, offset } = parsePagination(page, limit);
  const values = [limitNum, offset];
  let where = 'WHERE deleted_at IS NULL';
  if (role) { where += ` AND role = $3`; values.push(role); }

  const { rows } = await query(
    `SELECT id, email, role, first_name, last_name, phone, created_at FROM users
     ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findByPhone(phone) {
  const { rows } = await query(
    'SELECT id, email, role, first_name, last_name, phone FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
    [phone],
  );
  return rows[0] || null;
}

/**
 * Find the landlord who owns a given provisioned Twilio SMS number.
 * Used by the inbound SMS webhook to route messages to the right landlord context.
 */
async function findByTwilioSmsNumber(number) {
  const { rows } = await query(
    `SELECT id, email, role, first_name, last_name,
            ai_enabled, ai_reply_mode, ai_notify_on_send, ai_notify_channels
     FROM users
     WHERE twilio_sms_number = $1 AND deleted_at IS NULL LIMIT 1`,
    [number],
  );
  return rows[0] || null;
}

// ── Stripe Connect ────────────────────────────────────────────────────────────

async function findConnectStatus(id) {
  const { rows } = await query(
    'SELECT stripe_account_id, stripe_account_onboarded FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

async function findByStripeAccountId(stripeAccountId) {
  const { rows } = await query(
    `SELECT id, email, role, first_name, last_name, stripe_account_id, stripe_account_onboarded
     FROM users WHERE stripe_account_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [stripeAccountId],
  );
  return rows[0] || null;
}

async function updateStripeConnect(id, { accountId, onboarded }) {
  const { rows } = await query(
    `UPDATE users
     SET stripe_account_id = $1, stripe_account_onboarded = $2, updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING id, stripe_account_id, stripe_account_onboarded`,
    [accountId, onboarded, id],
  );
  return rows[0] || null;
}

// ── SaaS Billing ─────────────────────────────────────────────────────────────

async function findBillingStatus(id) {
  const { rows } = await query(
    `SELECT stripe_billing_customer_id, subscription_id, subscription_status, subscription_plan
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

async function findByStripeBillingCustomerId(customerId) {
  const { rows } = await query(
    `SELECT id, email, first_name, last_name, role,
            stripe_billing_customer_id, subscription_id, subscription_status, subscription_plan
     FROM users WHERE stripe_billing_customer_id = $1 AND deleted_at IS NULL`,
    [customerId],
  );
  return rows[0] || null;
}

async function updateBillingStatus(id, { billingCustomerId, subscriptionId, subscriptionStatus, subscriptionPlan } = {}, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const cols   = [];
  const params = [];
  let   i      = 1;
  if (billingCustomerId  !== undefined) { cols.push(`stripe_billing_customer_id = $${i++}`); params.push(billingCustomerId); }
  if (subscriptionId     !== undefined) { cols.push(`subscription_id = $${i++}`);             params.push(subscriptionId); }
  if (subscriptionStatus !== undefined) { cols.push(`subscription_status = $${i++}`);         params.push(subscriptionStatus); }
  if (subscriptionPlan   !== undefined) { cols.push(`subscription_plan = $${i++}`);           params.push(subscriptionPlan); }
  if (!cols.length) return;
  params.push(id);
  const { rows } = await fn(
    `UPDATE users SET ${cols.join(', ')}, updated_at = NOW() WHERE id = $${i} AND deleted_at IS NULL RETURNING id`,
    params,
  );
  return rows[0] || null;
}

async function findAllLandlords() {
  const { rows } = await query(
    `SELECT id, email, first_name, last_name, role,
            stripe_billing_customer_id, subscription_id, subscription_status, subscription_plan
     FROM users
     WHERE role = 'landlord' AND deleted_at IS NULL
     ORDER BY last_name, first_name`,
  );
  return rows;
}

// ── SES bounce handling ───────────────────────────────────────────────────────

/**
 * Mark a user's email address as permanently bounced.
 * Called by the SES bounce/complaint SNS webhook.
 * After this, no outbound email will be sent to this address until cleared.
 */
async function markEmailBounced(email) {
  await query(
    `UPDATE users
     SET email_bounced = true, email_bounced_at = NOW(), updated_at = NOW()
     WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
}

/**
 * Persist Twilio provisioning results for a landlord.
 * Called by twilioService after purchasing/releasing a number.
 */
async function updateTwilioProvisioning(landlordId, { twilioSmsNumber, twilioMessagingServiceSid }) {
  const { rows } = await query(
    `UPDATE users
     SET twilio_sms_number = $1, twilio_messaging_service_sid = $2, updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING id, twilio_sms_number, twilio_messaging_service_sid`,
    [twilioSmsNumber || null, twilioMessagingServiceSid || null, landlordId],
  );
  return rows[0] || null;
}

module.exports = {
  findByEmail, findById, findByPhone, findByTwilioSmsNumber, create, update, findAll,
  updatePassword, incrementTokenVersion,
  findConnectStatus, findByStripeAccountId, updateStripeConnect,
  findBillingStatus, findByStripeBillingCustomerId, updateBillingStatus, findAllLandlords,
  markEmailBounced, updateTwilioProvisioning,
};
