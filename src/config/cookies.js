/**
 * Shared refresh-token cookie configuration.
 * Both authController and invitationController set the same cookie — this
 * module is the single source of truth for COOKIE_NAME and cookieOptions().
 */

const { NODE_ENV } = require('./env');

const COOKIE_NAME = 'refreshToken';

/**
 * Returns HttpOnly cookie options for the refresh token.
 *
 * - httpOnly: JS cannot read it — XSS protection
 * - secure:   HTTPS-only in production
 * - sameSite: 'lax' allows cross-subdomain requests (www → api on same registrable domain)
 * - domain:   scoped to .lotlord.app in production so both subdomains receive the cookie
 * - path:     scoped to /api/v1/auth — not sent with every API request
 */
function cookieOptions() {
  const isProd = NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    domain:   isProd ? '.lotlord.app' : undefined,
    path:     '/api/v1/auth',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}

module.exports = { COOKIE_NAME, cookieOptions };
