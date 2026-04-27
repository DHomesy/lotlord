/**
 * Pricing plan definitions and tier helpers.
 *
 * Tiers (lowest → highest):
 *   0 — free       (no subscription)  1 property, 4 units, 4 tenants. ACH included.
 *   1 — starter    ($15/mo)           up to 25 properties. ACH + analytics.
 *   2 — enterprise ($49/mo)           unlimited residential properties. Starter + future premium features.
 *   3 — commercial ($79/mo + $2/unit) unlimited properties incl. commercial. Per-unit billing for commercial units.
 *
 * The `plan` string comes from subscription.plan which is populated by the
 * Stripe webhook handler using price.nickname. Make sure your Stripe prices are
 * named 'starter', 'enterprise', and 'commercial' in the Stripe Dashboard.
 *
 * Price history:
 *   enterprise: $50/mo → $49/mo (v1.5.13)
 *   starter:    $20/mo → $15/mo (v1.5.12)
 */

export const PLANS = {
  starter: {
    key:         'starter',
    label:       'Starter',
    price:       15,
    unitAddon:   null,
    description: 'Up to 25 properties, analytics & portfolio reporting',
    features:    [
      'Up to 25 properties',
      'Single & multi-family (up to 4 units each)',
      'Dashboard analytics',
      'Portfolio income summary',
      'ACH online rent collection',
      'All core features',
    ],
  },
  enterprise: {
    key:         'enterprise',
    label:       'Enterprise',
    price:       49,
    unitAddon:   null,
    description: 'Unlimited residential properties + team members',
    features:    [
      'Unlimited properties',
      'Single & multi-family (up to 4 units each)',
      'Everything in Starter',
      'Team members — add unlimited staff/managers',
      'AI features (coming soon)',
      'Document signing (coming soon)',
    ],
  },
  commercial: {
    key:         'commercial',
    label:       'Commercial',
    price:       79,
    unitAddon:   2,
    description: 'Unlimited properties including commercial — billed per commercial unit',
    features:    [
      'Unlimited properties (all types)',
      'Commercial properties with unlimited units',
      'Multi-family up to 4 units each',
      '$2/unit/mo for commercial units',
      'Team members — add unlimited staff/managers',
      'Everything in Enterprise',
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

/** True if the landlord has any active paid subscription (Starter, Enterprise, or Commercial). */
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
