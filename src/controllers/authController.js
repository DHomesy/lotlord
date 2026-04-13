const authService = require('../services/authService');
const env = require('../config/env');
const audit = require('../services/auditService');

const COOKIE_NAME = 'refreshToken';

/**
 * Options for the httpOnly refresh-token cookie.
 * - httpOnly: JS cannot read it (XSS protection)
 * - secure: HTTPS only in production
 * - sameSite: 'strict' prevents the cookie being sent on cross-site navigations (CSRF protection)
 * - path: scoped to auth routes only — not sent with every API request
 */
function cookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,
    // 'lax' allows the cookie to be sent from www.lotlord.app → api.lotlord.app
    // (same registrable domain, different subdomains). 'strict' would block it.
    sameSite: isProd ? 'lax' : 'lax',
    // Scope cookie to the root domain so both subdomains can access it in production
    domain:   isProd ? '.lotlord.app' : undefined,
    path:     '/api/v1/auth',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}

async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, phone, role, acceptedTerms } = req.body;
    const acceptedTermsAt = acceptedTerms === true ? new Date() : null;
    const { user, token, refreshToken } = await authService.register({ email, password, firstName, lastName, phone, role, acceptedTermsAt });
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    audit.log({ action: 'user_registered', resourceType: 'user', resourceId: user.id, userId: user.id, ipAddress: req.ip, metadata: { email: user.email, role: user.role } });
    res.status(201).json({ user, token });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user, token, refreshToken } = await authService.login({ email, password });
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    audit.log({ action: 'user_login', resourceType: 'user', resourceId: user.id, userId: user.id, ipAddress: req.ip, metadata: { email: user.email, role: user.role } });
    res.json({ user, token });
  } catch (err) { next(err); }
}

/**
 * POST /auth/refresh
 * No Authorization header needed — reads the httpOnly refreshToken cookie.
 * Returns a new short-lived access token and rotates the refresh cookie.
 */
async function refresh(req, res, next) {
  try {
    const cookieToken = req.cookies?.[COOKIE_NAME];
    const { user, token, refreshToken } = await authService.refreshFromCookie(cookieToken);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions()); // rotate
    res.json({ user, token });
  } catch (err) { next(err); }
}

/**
 * POST /auth/logout
 * Clears the refresh cookie. No body needed. Works even if the token is already expired.
 */
function logout(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/api/v1/auth' });
  res.json({ message: 'Logged out successfully' });
}

/**
 * POST /auth/forgot-password
 * Accepts an email address and sends a reset link if the account exists.
 * Always returns 200 regardless of whether the email is registered (no enumeration).
 */
async function forgotPassword(req, res, next) {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
}

/**
 * POST /auth/reset-password
 * Validates the token and sets the new password.
 */
async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) { next(err); }
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, cookieOptions, COOKIE_NAME };
