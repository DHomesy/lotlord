const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

async function getTenantOwnerPreference(tenantId, ownerId) {
  const { rows } = await query(
    `SELECT tenant_id, owner_id, sms_opt_in
     FROM tenant_sms_preferences
     WHERE tenant_id = $1 AND owner_id = $2
     LIMIT 1`,
    [tenantId, ownerId],
  );
  return rows[0] || null;
}

async function upsertTenantOwnerPreference({ tenantId, ownerId, smsOptIn }) {
  const { rows } = await query(
    `INSERT INTO tenant_sms_preferences (tenant_id, owner_id, sms_opt_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, owner_id)
     DO UPDATE SET sms_opt_in = EXCLUDED.sms_opt_in, updated_at = NOW()
     RETURNING tenant_id, owner_id, sms_opt_in`,
    [tenantId, ownerId, smsOptIn],
  );
  return rows[0] || null;
}

async function logConsentEvent({ tenantId = null, ownerId = null, eventType, source = 'sms_inbound', messageId = null, metadata = null }) {
  const { rows } = await query(
    `INSERT INTO sms_consent_events (id, tenant_id, owner_id, event_type, source, message_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), tenantId, ownerId, eventType, source, messageId, metadata],
  );
  return rows[0] || null;
}

async function getMonthlyUsage(ownerId, date = new Date()) {
  const usageMonth = monthStart(date);
  const { rows } = await query(
    `SELECT owner_id, usage_month, segments_used
     FROM sms_usage_monthly
     WHERE owner_id = $1 AND usage_month = $2
     LIMIT 1`,
    [ownerId, usageMonth],
  );
  return rows[0] || { owner_id: ownerId, usage_month: usageMonth, segments_used: 0 };
}

async function incrementMonthlyUsage({ ownerId, segments, date = new Date() }) {
  const usageMonth = monthStart(date);
  const { rows } = await query(
    `INSERT INTO sms_usage_monthly (owner_id, usage_month, segments_used)
     VALUES ($1, $2, $3)
     ON CONFLICT (owner_id, usage_month)
     DO UPDATE SET
       segments_used = sms_usage_monthly.segments_used + EXCLUDED.segments_used,
       updated_at = NOW()
     RETURNING owner_id, usage_month, segments_used`,
    [ownerId, usageMonth, segments],
  );
  return rows[0] || null;
}

module.exports = {
  getTenantOwnerPreference,
  upsertTenantOwnerPreference,
  logConsentEvent,
  getMonthlyUsage,
  incrementMonthlyUsage,
};
