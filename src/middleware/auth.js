const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const userRepo = require('../dal/userRepository');
const { query } = require('../config/db');

/**
 * Verifies the Bearer token in the Authorization header.
 * Attaches the decoded payload to req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
}

/**
 * Role-based access guard. Use after authenticate().
 * Example: router.get('/admin', authenticate, authorize('admin'), handler)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Requires the requesting user to have an active ("active" or "trialing") Pro subscription.
 * Admin users bypass this check — they are system operators, not subject to landlord limits.
 * Returns 402 Payment Required if the subscription gate is not met.
 */
async function requiresPro(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    // Admins operate the entire platform; they are never subscription-gated
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(req.user.sub);
    const proStatuses = ['active', 'trialing'];
    if (!billing || !proStatuses.includes(billing.subscription_status)) {
      return res.status(402).json({
        error: 'This feature requires a Pro plan. Upgrade to continue.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Requires the requesting landlord to have completed Stripe Connect onboarding.
 * Only applies to landlord-role users — admins and tenants pass through.
 * Returns 422 if the landlord's Connect account is not yet set up.
 */
async function requiresConnectOnboarded(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    // Only landlords need a connected payout account
    if (req.user.role !== 'landlord') return next();

    const connect = await userRepo.findConnectStatus(req.user.sub);
    if (!connect?.stripe_account_onboarded) {
      return res.status(422).json({
        error: 'Your Stripe payout account is not set up. Complete onboarding in your Profile before accepting ACH payments.',
        code: 'CONNECT_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Free-tier resource count guard. Returns an Express middleware that blocks creation
 * once a free-tier landlord/admin has reached `max` rows for the given resource.
 *
 * @param {'properties'|'units'|'tenants'} resource - Resource type to COUNT against
 * @param {number} max - Maximum rows allowed on the free tier
 *
 * Example: router.post('/', authenticate, checkFreeTierLimit('properties', 1), handler)
 */
function checkFreeTierLimit(resource, max) {
  const allowedResources = ['properties', 'units', 'tenants'];
  if (!allowedResources.includes(resource)) {
    throw new Error(`checkFreeTierLimit: unsupported resource "${resource}"`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });

      // Pro users have no hard cap
      const billing = await userRepo.findBillingStatus(req.user.sub);
      const proStatuses = ['active', 'trialing'];
      if (billing && proStatuses.includes(billing.subscription_status)) return next();

      // Admins bypass; they operate on behalf of landlords
      if (req.user.role === 'admin') return next();

      let countQuery, countParams;
      if (resource === 'properties') {
        countQuery = 'SELECT COUNT(*)::int AS cnt FROM properties WHERE owner_id = $1';
        countParams = [req.user.sub];
      } else if (resource === 'units') {
        // units are owned transitively through properties
        countQuery = `
          SELECT COUNT(*)::int AS cnt
          FROM units u
          JOIN properties p ON p.id = u.property_id
          WHERE p.owner_id = $1
        `;
        countParams = [req.user.sub];
      } else {
        // tenants: count active (non-terminated) leases under this landlord's properties
        countQuery = `
          SELECT COUNT(DISTINCT l.tenant_id)::int AS cnt
          FROM leases l
          JOIN units u ON u.id = l.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE p.owner_id = $1
            AND l.status NOT IN ('terminated', 'expired')
        `;
        countParams = [req.user.sub];
      }
      const { rows } = await query(countQuery, countParams);
      const count = rows[0]?.cnt ?? 0;
      if (count >= max) {
        return res.status(402).json({
          error: `Free plan is limited to ${max} ${resource}. Upgrade to Pro to add more.`,
          code: 'FREE_TIER_LIMIT',
          limit: max,
          current: count,
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { authenticate, authorize, requiresPro, requiresConnectOnboarded, checkFreeTierLimit };
