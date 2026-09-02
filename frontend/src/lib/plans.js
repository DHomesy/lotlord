/**
 * Pricing plan definitions and tier helpers.
 *
 * Tiers (lowest → highest):
 *   0 — free       (no subscription)  up to 2 properties, up to 4 units per property.
 *   1 — starter    ($10/mo)           paid tier with expanded access.
 *   2 — enterprise legacy paid label (treated as paid)
 *   3 — commercial legacy paid label (treated as paid)
 *
 * The `plan` string comes from subscription.plan which is populated by the
 * Stripe webhook handler using price.nickname. Make sure your Stripe prices are
 * named 'starter' in the Stripe Dashboard for the beta paid tier.
 */

export const PLANS = {
  starter: {
    key:         'starter',
    label:       'Paid',
    price:       10,
    unitAddon:   null,
    description: 'Expanded access for growing portfolios',
    features:    [
      'Everything in Free',
      '5+ units per property',
      'Commercial property access',
      'Expanded analytics and reporting',
      'ACH online rent collection',
      'Priority billing support',
    ],
  },
}

/** Returns the numeric tier rank (0 = free, 1 = starter, 2 = enterprise, 3 = commercial). */
export function planTier(plan) {
  if (plan === 'commercial') return 3
  if (plan === 'enterprise') return 2
  if (plan === 'starter')    return 1
  return 0
}

/** True if the landlord has any active paid subscription (Growth, Enterprise, or Commercial). */
export function hasStarter(subscription) {
  return ['active', 'trialing'].includes(subscription?.status)
}

/** True if the landlord has an active Enterprise subscription. */
export function hasEnterprise(subscription) {
  return ['active', 'trialing'].includes(subscription?.status) &&
    subscription?.plan === 'enterprise'
}

/** True if the landlord has an active Commercial subscription. */
export function hasCommercial(subscription) {
  return ['active', 'trialing'].includes(subscription?.status) &&
    subscription?.plan === 'commercial'
}
