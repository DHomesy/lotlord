/**
 * Unit tests for src/lib/stripeFees.js
 *
 * These tests cover the ACH processing fee calculation that appears in two places:
 *   - Backend: stripeService.createPaymentIntent (application_fee_amount)
 *   - Frontend: ChargesPage fee-breakdown display (must mirror backend formula)
 *
 * Running: npm test -- --testPathPattern=stripeFees
 * (No DB connection required — pure function tests)
 */

const { calculateAchFeeCents, achFeeBreakdown, ACH_CAP_CENTS } = require('../../src/lib/stripeFees');

describe('calculateAchFeeCents', () => {
  describe('standard rents below the cap ($625 threshold)', () => {
    it('$500 rent → 0.8% = 400 cents ($4.00 fee)', () => {
      expect(calculateAchFeeCents(50000)).toBe(400);
    });

    it('$100 rent → 0.8% = 80 cents ($0.80 fee)', () => {
      expect(calculateAchFeeCents(10000)).toBe(80);
    });

    it('$1.00 rent → 0.8% rounds to 1 cent', () => {
      // 100 * 0.008 = 0.8 → Math.round → 1
      expect(calculateAchFeeCents(100)).toBe(1);
    });

    it('$10 rent → 0.8% = 8 cents', () => {
      expect(calculateAchFeeCents(1000)).toBe(8);
    });
  });

  describe('cap boundary — $625 is the exact crossover', () => {
    it('$624.99 → 499.992 → rounds to 500 cents (still hits cap due to rounding)', () => {
      // Math.round(62499 * 0.008) = Math.round(499.992) = 500 → capped at 500
      expect(calculateAchFeeCents(62499)).toBe(500);
    });

    it('$625 → exactly $5.00 cap (500 cents)', () => {
      // Math.round(62500 * 0.008) = Math.round(500) = 500 → cap
      expect(calculateAchFeeCents(62500)).toBe(ACH_CAP_CENTS);
    });

    it('$620 → 496 cents ($4.96 fee, below cap)', () => {
      // Math.round(62000 * 0.008) = Math.round(496) = 496 < 500
      expect(calculateAchFeeCents(62000)).toBe(496);
    });
  });

  describe('rents above the cap — always $5.00', () => {
    it('$1,000 rent → capped at $5.00', () => {
      expect(calculateAchFeeCents(100000)).toBe(500);
    });

    it('$1,500 rent → capped at $5.00', () => {
      expect(calculateAchFeeCents(150000)).toBe(500);
    });

    it('$5,000 rent → capped at $5.00', () => {
      expect(calculateAchFeeCents(500000)).toBe(500);
    });
  });

  describe('edge cases', () => {
    it('0 cents → 0 fee', () => {
      expect(calculateAchFeeCents(0)).toBe(0);
    });

    it('negative amount → 0 fee (guard against invalid input)', () => {
      expect(calculateAchFeeCents(-1000)).toBe(0);
    });

    it('NaN → 0 fee', () => {
      expect(calculateAchFeeCents(NaN)).toBe(0);
    });

    it('Infinity → 0 fee (guard against non-finite input)', () => {
      expect(calculateAchFeeCents(Infinity)).toBe(0);
    });
  });
});

describe('achFeeBreakdown', () => {
  it('$1,000 rent: amountCents=100000, feeCents=500, totalCents=100500', () => {
    const { amountCents, feeCents, totalCents } = achFeeBreakdown(1000);
    expect(amountCents).toBe(100000);
    expect(feeCents).toBe(500);
    expect(totalCents).toBe(100500);
  });

  it('$500 rent: total is $504.00 ($500 + $4.00 fee)', () => {
    const { amountCents, feeCents, totalCents } = achFeeBreakdown(500);
    expect(amountCents).toBe(50000);
    expect(feeCents).toBe(400);
    expect(totalCents).toBe(50400);
  });

  it('totalCents always equals amountCents + feeCents', () => {
    const amounts = [100, 500, 624, 625, 1000, 2000];
    for (const dollars of amounts) {
      const { amountCents, feeCents, totalCents } = achFeeBreakdown(dollars);
      expect(totalCents).toBe(amountCents + feeCents);
    }
  });

  it('landlord never receives more than amountCents (no platform markup)', () => {
    // Stripe's actual fee = 0.8% of totalCents, capped at $5.
    // Platform collects feeCents via application_fee_amount.
    // At $625+ the cap means platform keeps exactly $5 and Stripe takes $5 → net $0.
    // Below $625 platform keeps feeCents but Stripe takes slightly more → platform absorbs difference.
    const amounts = [100, 300, 500, 620, 625, 1000];
    for (const dollars of amounts) {
      const { amountCents, feeCents, totalCents } = achFeeBreakdown(dollars);
      const stripeActualFee = Math.min(Math.round(totalCents * 0.008), 500);
      // Platform net should never be positive (never extracts a profit from the fee)
      const platformNet = feeCents - stripeActualFee;
      expect(platformNet).toBeLessThanOrEqual(0);
    }
  });
});
