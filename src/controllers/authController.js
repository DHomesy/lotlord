const authService = require('../services/authService');
const env = require('../config/env');
const audit = require('../services/auditService');
const { COOKIE_NAME, cookieOptions } = require('../config/cookies');

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
 * Increments the user's token_version (invalidating all current refresh tokens),
 * then clears the refresh cookie. Even if the cookie is missing/expired, the
 * cookie is cleared and a 200 is returned.
 */
async function logout(req, res, next) {
  try {
    await authService.logoutUser(req.cookies?.[COOKIE_NAME]);
    res.clearCookie(COOKIE_NAME, { path: '/api/v1/auth' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
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

/**
 * POST /auth/verify-email
 * Confirms the token from the verification email link.
 * Returns a fresh access token so the frontend can auto-login.
 */
async function verifyEmail(req, res, next) {
  try {
    const user = await authService.verifyEmail(req.body.token);
    // Issue a fresh access token with emailVerified: true baked in
    const { token, refreshToken } = await authService.issueTokensForUser(user.id);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    res.json({ message: 'Email verified successfully.', token, user });
  } catch (err) { next(err); }
}

/**
 * POST /auth/resend-verification
 * Resends the verification email for the currently authenticated user.
 */
async function resendVerification(req, res, next) {
  try {
    await authService.resendVerificationEmail(req.user.sub);
    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) { next(err); }
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, verifyEmail, resendVerification, cookieOptions, COOKIE_NAME };
