/**
 * Shared refresh-token cookie configuration.
 * Both authController and invitationController set the same cookie — this
 * module is the single source of truth for COOKIE_NAME and cookieOptions().
 */

const { NODE_ENV, COOKIE_DOMAIN, COOKIE_SAME_SITE, COOKIE_SECURE } = require('./env');

const COOKIE_NAME = 'refreshToken';

/**
 * Returns HttpOnly cookie options for the refresh token.
 *
 * - httpOnly: JS cannot read it — XSS protection
 * - secure:   HTTPS-only in production
 * - sameSite: 'lax' allows cross-subdomain requests (www → api on same registrable domain)
 * - domain:   set via COOKIE_DOMAIN env var (e.g. .lotlord.app) so www + api subdomains
 *             share the cookie. Leave unset in test/staging environments.
 * - path:     scoped to /api/v1/auth — not sent with every API request
 */
function cookieOptions() {
  const isProd = NODE_ENV === 'production';
  const sameSiteRaw = String(COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax';

  let secure = isProd;
  if (COOKIE_SECURE === 'true') secure = true;
  if (COOKIE_SECURE === 'false') secure = false;
  // Browser requirement: SameSite=None cookies must be Secure.
  if (sameSite === 'none') secure = true;

  return {
    httpOnly: true,
    secure,
    sameSite,
    domain:   COOKIE_DOMAIN || undefined,
    path:     '/api/v1/auth',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}

module.exports = { COOKIE_NAME, cookieOptions };
