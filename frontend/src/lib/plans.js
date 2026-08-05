/**
 * Pricing plan definitions and tier helpers.
 *
 * Tiers (lowest → highest):
 *   0 — starter/free (no subscription) 1 property, 4 units, 4 tenants.
 *   2 — autopilot    ($49/mo)          Autopilot tier with up to 20 units.
 *   3 — portfolio    ($79/mo)          Portfolio tier with expanded limits.
 *
 * The `plan` string comes from subscription.plan which is populated by the
 * Stripe webhook handler using price.nickname. Make sure your Stripe prices are
 * named 'autopilot' and 'portfolio' in the Stripe Dashboard.
 */

export const PLANS = {
  autopilot: {
    key:         'autopilot',
    label:       'Autopilot',
    price:       49,
    unitAddon:   null,
    description: 'AI inbox + dedicated SMS number for up to 20 units',
    features:    [
      'Up to 20 total units',
      'Dedicated SMS number',
      'AI inbox + suggested replies',
      'Maintenance creation from conversations',
      'Preferred-vendor routing',
      'Operational briefing',
      'Approximately 500 included SMS segments',
      'All Starter features',
    ],
  },
  portfolio: {
    key:         'portfolio',
    label:       'Portfolio',
    price:       79,
    unitAddon:   null,
    description: 'Higher limits, approvals, vendor workflows, and priority support',
    features:    [
      'More units and higher communication allowance',
      'Employee permissions',
      'Multiple approval policies',
      'Vendor workflows',
      'Priority support',
      'All Autopilot features',
    ],
  },
}

export function normalizePlan(plan) {
  if (plan === 'enterprise') return 'autopilot'
  if (plan === 'commercial') return 'portfolio'
  return plan
}

/** Returns the numeric tier rank (0 = free, 1 = starter, 2 = autopilot, 3 = portfolio). */
export function planTier(plan) {
  const normalized = normalizePlan(plan)
  if (normalized === 'portfolio') return 3
  if (normalized === 'autopilot') return 2
  if (normalized === 'starter')   return 1
  return 0
}

/** True if the landlord has any active paid subscription (Autopilot or Portfolio). */
export function hasStarter(subscription) {
  return ['active', 'trialing'].includes(subscription?.status)
}

/** True if the landlord has an active Autopilot subscription. */
export function hasEnterprise(subscription) {
  const plan = normalizePlan(subscription?.plan)
  return ['active', 'trialing'].includes(subscription?.status) &&
    plan === 'autopilot'
}

/** True if the landlord has an active Portfolio subscription. */
export function hasCommercial(subscription) {
  const plan = normalizePlan(subscription?.plan)
  return ['active', 'trialing'].includes(subscription?.status) &&
    plan === 'portfolio'
}

/** Alias for commercial tier in user-facing copy. */
export function hasPortfolio(subscription) {
  return hasCommercial(subscription)
}

export function getPlanLabel(plan) {
  const normalized = normalizePlan(plan)
  return PLANS[normalized]?.label || normalized || 'Starter (Free)'
}
