/**
 * Auth helpers shared across services, middleware, and controllers.
 */

/**
 * Returns the effective owner/landlord ID for a given JWT user payload.
 *
 * - For employees: returns their employer_id (so all scoped DB queries
 *   operate on their employer's data, not their own user row).
 * - For all other roles: returns user.sub (the user's own ID).
 *
 * Usage:
 *   const { resolveOwnerId } = require('../lib/authHelpers');
 *   const ownerId = resolveOwnerId(req.user);
 *
 * @param {object} user  The decoded JWT payload attached by authenticate()
 * @returns {string}     UUID of the effective landlord/owner
 */
function resolveOwnerId(user) {
  if (user?.role === 'employee') {
    if (!user.employerId) {
      const err = new Error('Employee token missing employerId claim — please log in again');
      err.status = 401;
      throw err;
    }
    return user.employerId;
  }
  return user?.sub;
}

module.exports = { resolveOwnerId };
