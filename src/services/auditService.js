/**
 * Audit Service
 * --------------
 * Thin wrapper around auditRepository that silently swallows errors so a
 * logging failure never breaks a primary operation.
 *
 * Usage (fire-and-forget):
 *   auditService.log({ action: 'payment_created', resourceType: 'payment', resourceId: paymentId, userId: req.user.sub, metadata: { amount } })
 *
 * Usage (await if you need confirmation, e.g. in tests):
 *   await auditService.log({ ... })
 */

const auditRepo = require('../dal/auditRepository');

/**
 * Record an audit event. Never throws — errors are logged to console only.
 *
 * @param {object} opts - see auditRepository.log for all fields
 * @returns {Promise<void>}
 */
async function log(opts) {
  try {
    await auditRepo.log(opts);
  } catch (err) {
    // Audit failure must never crash the main request
    console.error('[audit] failed to write log entry:', err.message, opts);
  }
}

/**
 * List audit log entries with filters.
 * Delegates directly to the repository.
 */
async function getEntries(filters) {
  return auditRepo.findAll(filters);
}

module.exports = { log, getEntries };
