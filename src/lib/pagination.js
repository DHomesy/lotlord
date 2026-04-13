/**
 * Parses and sanitises pagination parameters from query strings.
 *
 * @param {any}    page               - Raw page value (may be string, undefined, NaN)
 * @param {any}    limit              - Raw limit value (may be string, undefined, NaN)
 * @param {number} [maxLimit=200]     - Hard ceiling on limit
 * @param {number} [defaultLimit=20]  - Fallback when limit is absent/invalid
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(page, limit, maxLimit = 200, defaultLimit = 20) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(maxLimit, Math.max(1, parseInt(limit, 10) || defaultLimit));
  return { page: p, limit: l, offset: (p - 1) * l };
}

module.exports = { parsePagination };
