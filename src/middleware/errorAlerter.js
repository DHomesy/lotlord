/**
 * Error Alerter
 * -------------
 * Sends an email to ALERT_EMAIL when a 5xx error or unhandled rejection occurs.
 *
 * Features:
 *   - 10-minute per-error cooldown to prevent flooding (keyed on method + route + message)
 *   - No-ops in 'test' and 'development' environments — production only
 *   - No-ops silently if ALERT_EMAIL is not configured
 *   - Never throws — alerting failure is logged but never propagates
 */

const { sendEmail } = require('../integrations/email');
const { ALERT_EMAIL, NODE_ENV } = require('../config/env');

// ── Cooldown map: errorKey → timestamp of last alert sent ─────────────────────
const cooldownMap = new Map();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

function cooldownKey(err, { method = '', route = '' } = {}) {
  return `${method}:${route}:${(err.message || '').slice(0, 120)}`;
}

function isOnCooldown(key) {
  const last = cooldownMap.get(key);
  if (!last) return false;
  if (Date.now() - last < COOLDOWN_MS) return true;
  cooldownMap.delete(key); // expired — clean up
  return false;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml({ method, route, userId, role, err, timestamp }) {
  const userInfo = userId ? `${userId}${role ? ` (${role})` : ''}` : 'unauthenticated';
  const stack = (err.stack || err.message || String(err))
    .split('\n')
    .slice(0, 15)
    .join('\n');

  return `
    <h2 style="color:#c0392b;margin-bottom:8px">
      🚨 LotLord Server Error
    </h2>
    <table style="font-family:monospace;font-size:13px;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Environment</td>
        <td style="padding:4px 0"><strong>${escapeHtml(NODE_ENV)}</strong></td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#666">Time</td>
        <td style="padding:4px 0">${escapeHtml(timestamp)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#666">Route</td>
        <td style="padding:4px 0">${escapeHtml(method)} ${escapeHtml(route)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#666">User</td>
        <td style="padding:4px 0">${escapeHtml(userInfo)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#666">Error</td>
        <td style="padding:4px 0;color:#c0392b"><strong>${escapeHtml(err.message || String(err))}</strong></td>
      </tr>
    </table>
    <h4 style="margin:0 0 8px">Stack Trace</h4>
    <pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow-x:auto;white-space:pre-wrap">${escapeHtml(stack)}</pre>
    <p style="color:#aaa;font-size:11px;margin-top:16px">
      Duplicate alerts for this error are suppressed for 10 minutes.
    </p>
  `;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send an error alert email to ALERT_EMAIL.
 *
 * Safe to call from anywhere — no-ops in non-production environments,
 * no-ops if ALERT_EMAIL is not set, respects cooldown.
 *
 * @param {Error}  err
 * @param {object} [context]
 * @param {string} [context.method]  HTTP method or event name
 * @param {string} [context.route]   Request path or event source
 * @param {string} [context.userId]  Authenticated user ID
 * @param {string} [context.role]    Authenticated user role
 */
async function sendAlert(err, context = {}) {
  if (NODE_ENV === 'test' || NODE_ENV === 'development') return;
  if (!ALERT_EMAIL) return;

  const key = cooldownKey(err, context);
  if (isOnCooldown(key)) return;
  cooldownMap.set(key, Date.now());

  const { method = 'UNKNOWN', route = 'UNKNOWN', userId = null, role = null } = context;
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const subject = `[LotLord] 🚨 ${method} ${route} — ${(err.message || 'Unknown error').slice(0, 80)}`;

  try {
    await sendEmail({
      to: ALERT_EMAIL,
      subject,
      html: buildEmailHtml({ method, route, userId, role, err, timestamp }),
    });
    console.log(`[errorAlerter] Alert sent for: ${key}`);
  } catch (emailErr) {
    // Never let alerting failure propagate — log only
    console.error('[errorAlerter] Failed to send alert email:', emailErr.message);
  }
}

module.exports = { sendAlert };
