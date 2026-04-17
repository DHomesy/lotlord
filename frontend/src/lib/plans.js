/**
 * Pricing plan definitions and tier helpers.
 *
 * Tiers (lowest → highest):
 *   0 — free       (no subscription)  1 property, 4 units, 4 tenants. ACH included.
 *   1 — starter    ($29/mo)           up to 25 properties. ACH + analytics.
 *   2 — enterprise ($50/mo)           unlimited properties. Starter + future premium features.
 *
 * The `plan` string comes from subscription.plan which is populated by the
 * Stripe webhook handler using price.nickname. Make sure your Stripe prices are
 * named 'starter' and 'enterprise' in the Stripe Dashboard.
 */

export const PLANS = {
  starter: {
    key:         'starter',
    label:       'Starter',
    price:       29,
    description: 'Up to 25 properties, analytics & portfolio reporting',
    features:    [
      'Up to 25 properties',
      'Dashboard analytics',
      'Portfolio income summary',
      'ACH online rent collection',
      'All core features',
    ],
  },
  enterprise: {
    key:         'enterprise',
    label:       'Enterprise',
    price:       50,
    description: 'Unlimited properties + upcoming premium features',
    features:    [
      'Unlimited properties',
      'Everything in Starter',
      'ACH online rent collection',
      'AI features (coming soon)',
      'Document signing (coming soon)',
    ],
  },
}

/** Returns the numeric tier rank (0 = free, 1 = starter, 2 = enterprise). */
export function planTier(plan) {
  if (plan === 'enterprise') return 2
  if (plan === 'starter')    return 1
  return 0
}

/** True if the landlord has any active paid subscription (Starter or Enterprise). */
export function hasStarter(subscription) {
  return ['active', 'trialing'].includes(subscription?.status)
}

/** True if the landlord has an active Enterprise subscription. */
export function hasEnterprise(subscription) {
  return ['active', 'trialing'].includes(subscription?.status) &&
    subscription?.plan === 'enterprise'
}
