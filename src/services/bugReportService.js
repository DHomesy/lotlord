const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const audit = require('./auditService');
const email = require('../integrations/email');
const { escapeHtml } = require('../lib/templateUtils');

function normalizeSeverity(severity) {
  const s = String(severity || '').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(s)) return s;
  return 'medium';
}

async function submitBugReport({ user, summary, details, severity, pageUrl, userAgent }) {
  const reportId = uuidv4();
  const sev = normalizeSeverity(severity);
  const supportEmail = env.BUG_REPORT_EMAIL || env.ALERT_EMAIL || '';

  const subject = `[LotLord Bug] ${sev.toUpperCase()} - ${String(summary || '').trim()}`;
  const lines = [
    `Report ID: ${reportId}`,
    `Severity: ${sev}`,
    `Summary: ${String(summary || '').trim()}`,
    `Details: ${String(details || '').trim()}`,
    `Page: ${String(pageUrl || '').trim() || 'unknown'}`,
    `User: ${user?.sub || 'unknown'} (${user?.role || 'unknown'})`,
    `User Email: ${user?.email || 'unknown'}`,
    `User Agent: ${String(userAgent || '').trim() || 'unknown'}`,
  ];
  const text = lines.join('\n');

  if (supportEmail) {
    await email.sendEmail({
      to: supportEmail,
      subject,
      html: `<pre>${escapeHtml(text)}</pre>`,
      text,
    });
  }

  await audit.log({
    action: 'bug_report_submitted',
    resourceType: 'support',
    resourceId: reportId,
    userId: user?.sub || null,
    metadata: {
      severity: sev,
      summary: String(summary || '').trim().slice(0, 240),
      pageUrl: String(pageUrl || '').trim().slice(0, 500),
      supportEmailConfigured: !!supportEmail,
    },
  });

  return {
    reportId,
    severity: sev,
    deliveredToSupport: !!supportEmail,
  };
}

module.exports = {
  submitBugReport,
};
