/**
 * Email / SMS template rendering utilities.
 *
 * Extracted into a standalone module so they can be unit-tested without
 * standing up the full notification service or database.
 */

/**
 * Escape HTML special characters to prevent injection of markup into
 * email bodies.  Handles the full OWASP-recommended set: & < > " '
 *
 * @param {*} str - Any value; coerced to string via String(str ?? '')
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Replace all {{key}} placeholders in a template string.
 * Unknown keys are left unchanged so missing variables are visible in logs.
 *
 * Values are HTML-escaped when channel === 'email' to prevent injection.
 * SMS values are inserted verbatim.
 *
 * @param {string} template  - Template string containing {{key}} tokens
 * @param {object} variables - Key/value pairs for substitution
 * @param {string} [channel] - 'email' (default) or 'sms'
 * @returns {string}
 */
function renderTemplate(template, variables = {}, channel = 'email') {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (variables[key] === undefined) return match;
    return channel === 'email' ? escapeHtml(String(variables[key])) : String(variables[key]);
  });
}

module.exports = { escapeHtml, renderTemplate };
