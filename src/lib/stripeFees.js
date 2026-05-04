/**
 * ACH fee calculation helpers.
 *
 * Stripe charges the PLATFORM 0.8% of the debit total, capped at $5.00.
 * We calculate the fee on the charge amount (not the total debit) so the
 * tenant never overpays — the platform absorbs at most ≤4 cents per
 * transaction on rents under $625. Above $625 the $5 cap applies exactly.
 *
 * Money flow (Stripe Connect destination charge):
 *   Tenant debit       = amountCents + feeCents
 *   Landlord receives  = amountCents   (exact rent, via transfer_data)
 *   Platform receives  = feeCents      (application_fee_amount)
 *   Stripe charges     ≈ feeCents      (0.8% of total, $5 cap)
 *   Platform net       ≈ $0
 */

const ACH_RATE       = 0.008;   // 0.8%
const ACH_CAP_CENTS  = 500;     // $5.00

/**
 * Calculate the ACH processing fee in cents for a given charge amount.
 *
 * @param {number} amountCents - Charge amount in cents (integer)
 * @returns {number} Fee in cents (integer, capped at $5)
 */
function calculateAchFeeCents(amountCents) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.min(Math.round(amountCents * ACH_RATE), ACH_CAP_CENTS);
}

/**
 * Convert a dollar amount to cents and calculate the fee.
 *
 * @param {number} amountDollars - Charge amount in dollars
 * @returns {{ amountCents: number, feeCents: number, totalCents: number }}
 */
function achFeeBreakdown(amountDollars) {
  const amountCents = Math.round(amountDollars * 100);
  const feeCents    = calculateAchFeeCents(amountCents);
  return { amountCents, feeCents, totalCents: amountCents + feeCents };
}

module.exports = { calculateAchFeeCents, achFeeBreakdown, ACH_RATE, ACH_CAP_CENTS };
