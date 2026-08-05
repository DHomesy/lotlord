const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const userRepo = require('../dal/userRepository');
const { query } = require('../config/db');
const { resolveOwnerId } = require('../lib/authHelpers');

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

function normalizePlan(plan) {
  if (plan === 'enterprise') return 'autopilot';
  if (plan === 'commercial') return 'portfolio';
  return plan;
}

/**
 * Requires the requesting landlord to have any active paid subscription (Autopilot or Portfolio).
 * Grants access to analytics and portfolio reporting features.
 * Admin users bypass this check.
 * Returns 402 Payment Required if the gate is not met.
 */
async function requiresStarter(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(resolveOwnerId(req.user));
    if (!billing || !ACTIVE_STATUSES.includes(billing.subscription_status)) {
      return res.status(402).json({
        error: 'This feature requires an Autopilot or Portfolio plan. Upgrade to continue.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Requires the requesting landlord to have an active Portfolio subscription.
 * Reserved for future premium features (AI, document signing, etc.).
 * Admin users bypass this check.
 * Returns 402 Payment Required if the gate is not met.
 */
async function requiresEnterprise(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(resolveOwnerId(req.user));
    const plan = normalizePlan(billing?.subscription_plan);
    if (!billing || !ACTIVE_STATUSES.includes(billing.subscription_status) || plan !== 'portfolio') {
      return res.status(402).json({
        error: 'This feature requires a Portfolio plan. Upgrade to continue.',
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
    // Only landlords and employees (acting as landlord) need a connected payout account
    if (req.user.role !== 'landlord' && req.user.role !== 'employee') return next();

    const connect = await userRepo.findConnectStatus(resolveOwnerId(req.user));
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
 *   starter    — legacy paid tier (grandfathered)
 *   autopilot  — Autopilot tier (price nickname = 'autopilot')
 *   portfolio  — Portfolio tier (price nickname = 'portfolio')
 *
 * Infinity = no hard cap.
 *
 * Note: multi-family unit cap (max 4 per property) is enforced separately
 * in checkPlanLimit('units') and in unitService.assertMultiFamilyCap().
 */
const PLAN_LIMITS = {
  properties: { free: 1,  starter: Infinity, autopilot: Infinity, portfolio: Infinity },
  units:      { free: 4,  starter: 20, autopilot: 20, portfolio: Infinity },
  tenants:    { free: 4,  starter: Infinity, autopilot: Infinity, portfolio: Infinity },
  employees:  { free: 0,  starter: 0, autopilot: 0, portfolio: Infinity },
};

/**
 * Requires the requesting landlord to have an active Commercial subscription.
 * Gates commercial property creation. Admin users bypass this check.
 * Returns 402 with code 'COMMERCIAL_REQUIRED' if the gate is not met.
 *
 * NOTE: This middleware is available for future route-level gating of an entire
 * endpoint. Currently the commercial plan check is done inside the service layer
 * (propertyService.assertCommercialPlan) so it fires only when propertyType === 'commercial',
 * avoiding a DB round-trip for single/multi-family property changes. Only mount this
 * middleware on a route if the *entire* route should require the commercial plan.
 */
async function requiresCommercialPlan(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin') return next();

    const billing = await userRepo.findBillingStatus(resolveOwnerId(req.user));
    const isActive = ACTIVE_STATUSES.includes(billing?.subscription_status);
    const plan = normalizePlan(billing?.subscription_plan);
    if (!isActive || plan !== 'portfolio') {
      return res.status(402).json({
        error: 'Commercial properties require the Portfolio plan ($79/mo). Upgrade to continue.',
        code:  'COMMERCIAL_REQUIRED',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Tier-aware resource count guard. Blocks creation once the user has reached
 * their plan's limit for the given resource.
 *
 *   Free       → properties: 1, units: 4, tenants: 4
 *   Autopilot  → units: 20, employees: 0
 *   Portfolio  → unlimited + employee access
 *
 * @param {'properties'|'units'|'tenants'} resource
 *
 * Example: router.post('/', authenticate, checkPlanLimit('properties'), handler)
 */
function checkPlanLimit(resource) {
  const allowedResources = ['properties', 'units', 'tenants', 'employees'];
  if (!allowedResources.includes(resource)) {
    throw new Error(`checkPlanLimit: unsupported resource "${resource}"`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });

      // Admins bypass; employees use their employer's billing
      if (req.user.role === 'admin') return next();

      const billing      = await userRepo.findBillingStatus(resolveOwnerId(req.user));
      const isActive     = ['active', 'trialing'].includes(billing?.subscription_status);
      const plan         = isActive ? (normalizePlan(billing?.subscription_plan) ?? 'autopilot') : 'free';
      if (plan === 'portfolio') return next();

      const limits = PLAN_LIMITS[resource];
      const max    = limits[plan] ?? limits.free;
      if (max === Infinity) return next();

      // Count against the effective owner (employer for employees, self for landlords)
      const effectiveOwnerId = resolveOwnerId(req.user);
      let countQuery, countParams;
      if (resource === 'properties') {
        countQuery  = 'SELECT COUNT(*)::int AS cnt FROM properties WHERE owner_id = $1 AND deleted_at IS NULL';
        countParams = [effectiveOwnerId];
      } else if (resource === 'units') {
        // Global unit cap applies on Free only. On Starter the global limit is Infinity,
        // but multi-family per-property cap (4 units) is enforced in unitService.
        countQuery = `
          SELECT COUNT(*)::int AS cnt
          FROM units u
          JOIN properties p ON p.id = u.property_id
          WHERE p.owner_id = $1
            AND u.deleted_at IS NULL
            AND p.deleted_at IS NULL
        `;
        countParams = [effectiveOwnerId];
      } else if (resource === 'employees') {
        // Count active employees under this landlord
        countQuery  = 'SELECT COUNT(*)::int AS cnt FROM users WHERE employer_id = $1 AND deleted_at IS NULL';
        countParams = [effectiveOwnerId];
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
        countParams = [effectiveOwnerId];
      }
      const { rows } = await query(countQuery, countParams);
      const count = rows[0]?.cnt ?? 0;
      if (count >= max) {
        const planLabel = plan === 'free'
          ? 'Starter (Free)'
          : plan === 'autopilot'
            ? 'Autopilot'
            : plan === 'portfolio'
              ? 'Portfolio'
              : 'Autopilot';
        const upgradeHint = plan === 'autopilot' || plan === 'starter'
          ? 'Upgrade to Portfolio for unlimited access and employee permissions.'
          : resource === 'employees'
            ? 'Upgrade to Portfolio for team member permissions.'
            : `Upgrade to Autopilot (up to 20 units) or Portfolio (higher limits) to add more.`;
        return res.status(402).json({
          error:   `${planLabel} plan is limited to ${max} ${resource}. ${upgradeHint}`,
          code:    'PLAN_LIMIT',
          plan,
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
  requiresCommercialPlan,
  requiresPro,          // backward-compat alias for requiresStarter
  requiresConnectOnboarded,
  checkPlanLimit,
  checkFreeTierLimit,   // backward-compat alias for checkPlanLimit
  requiresVerified,
};
