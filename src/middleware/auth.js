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

const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * Requires the requesting landlord to have any active paid subscription (Starter or Enterprise).
 * Grants access to analytics and portfolio reporting features.
 * Admin users bypass this check.
 * Returns 402 Payment Required if the gate is not met.
 */
async function requiresStarter(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(req.user.sub);
    if (!billing || !ACTIVE_STATUSES.includes(billing.subscription_status)) {
      return res.status(402).json({
        error: 'This feature requires a Starter or Enterprise plan. Upgrade to continue.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Requires the requesting landlord to have an active Enterprise subscription.
 * Reserved for future premium features (AI, document signing, etc.).
 * Admin users bypass this check.
 * Returns 402 Payment Required if the gate is not met.
 */
async function requiresEnterprise(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(req.user.sub);
    if (!billing || !ACTIVE_STATUSES.includes(billing.subscription_status) || billing.subscription_plan !== 'enterprise') {
      return res.status(402).json({
        error: 'This feature requires an Enterprise plan. Upgrade to continue.',
        code: 'ENTERPRISE_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

// Backward-compat alias
const requiresPro = requiresStarter;

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
 * Per-plan resource limits.
 *   free       — no active subscription
 *   starter    — any active subscription (price nickname = 'starter')
 *   enterprise — active subscription with price nickname = 'enterprise'
 *
 * Infinity = no hard cap.
 */
const PLAN_LIMITS = {
  properties: { free: 1,  starter: 25, enterprise: Infinity },
  units:      { free: 4,  starter: Infinity, enterprise: Infinity },
  tenants:    { free: 4,  starter: Infinity, enterprise: Infinity },
};

/**
 * Tier-aware resource count guard. Blocks creation once the user has reached
 * their plan's limit for the given resource.
 *
 *   Free       → properties: 1,  units: 4,  tenants: 4
 *   Starter    → properties: 25, units: ∞,  tenants: ∞
 *   Enterprise → unlimited
 *
 * @param {'properties'|'units'|'tenants'} resource
 *
 * Example: router.post('/', authenticate, checkPlanLimit('properties'), handler)
 */
function checkPlanLimit(resource) {
  const allowedResources = ['properties', 'units', 'tenants'];
  if (!allowedResources.includes(resource)) {
    throw new Error(`checkPlanLimit: unsupported resource "${resource}"`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });

      // Admins bypass; they operate on behalf of landlords
      if (req.user.role === 'admin') return next();

      const billing      = await userRepo.findBillingStatus(req.user.sub);
      const isActive     = ['active', 'trialing'].includes(billing?.subscription_status);
      const isEnterprise = isActive && billing?.subscription_plan === 'enterprise';

      // Enterprise: no limits
      if (isEnterprise) return next();

      const limits = PLAN_LIMITS[resource];
      const max    = isActive ? limits.starter : limits.free;
      if (max === Infinity) return next();

      let countQuery, countParams;
      if (resource === 'properties') {
        countQuery  = 'SELECT COUNT(*)::int AS cnt FROM properties WHERE owner_id = $1 AND deleted_at IS NULL';
        countParams = [req.user.sub];
      } else if (resource === 'units') {
        countQuery = `
          SELECT COUNT(*)::int AS cnt
          FROM units u
          JOIN properties p ON p.id = u.property_id
          WHERE p.owner_id = $1
            AND u.deleted_at IS NULL
            AND p.deleted_at IS NULL
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
        const planLabel   = isActive ? 'Starter' : 'Free';
        const upgradeHint = isActive
          ? 'Upgrade to Enterprise for unlimited access.'
          : `Upgrade to Starter (up to 25 ${resource}) or Enterprise (unlimited) to add more.`;
        return res.status(402).json({
          error:   `${planLabel} plan is limited to ${max} ${resource}. ${upgradeHint}`,
          code:    'PLAN_LIMIT',
          plan:    isActive ? 'starter' : 'free',
          limit:   max,
          current: count,
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

// Backward-compat alias (routes may still use the old name)
const checkFreeTierLimit = checkPlanLimit;

/**
 * Blocks landlords whose email address has not yet been verified.
 * Applies only to role='landlord'. Admins and tenants pass through.
 *
 * Synchronous — reads the emailVerified field baked into the JWT by signToken.
 * Must run AFTER authenticate() so req.user is populated.
 *
 * Returns 403 FORBIDDEN with code 'EMAIL_UNVERIFIED' so the frontend
 * can redirect to the "awaiting verification" page.
 */
function requiresVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'landlord') return next();
  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Please verify your email address before accessing this feature.',
      code: 'EMAIL_UNVERIFIED',
    });
  }
  next();
}

module.exports = {
  authenticate,
  authorize,
  requiresStarter,
  requiresEnterprise,
  requiresPro,          // backward-compat alias for requiresStarter
  requiresConnectOnboarded,
  checkPlanLimit,
  checkFreeTierLimit,   // backward-compat alias for checkPlanLimit
  requiresVerified,
};
