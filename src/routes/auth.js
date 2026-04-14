const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { registerValidators, loginValidators, forgotPasswordValidators, resetPasswordValidators, validate } = require('../middleware/validators');

// POST /api/v1/auth/register
router.post('/register', registerValidators, validate, controller.register);

// POST /api/v1/auth/login
router.post('/login', loginValidators, validate, controller.login);

// POST /api/v1/auth/refresh
// No Authorization header needed — reads the httpOnly refreshToken cookie.
// The client calls this at app boot (page refresh) and when a 401 is received.
router.post('/refresh', controller.refresh);

// POST /api/v1/auth/logout
// Clears the refreshToken cookie. No body required.
router.post('/logout', controller.logout);

// POST /api/v1/auth/forgot-password
// Accepts email; sends reset link if account exists. Always returns 200.
router.post('/forgot-password', forgotPasswordValidators, validate, controller.forgotPassword);

// POST /api/v1/auth/reset-password
// Validates the one-time token and updates the password.
router.post('/reset-password', resetPasswordValidators, validate, controller.resetPassword);

// POST /api/v1/auth/verify-email
// Confirms the token from the emailed verification link. Public — no auth required.
router.post('/verify-email', controller.verifyEmail);

// POST /api/v1/auth/resend-verification
// Sends a fresh verification email. Requires a valid access token.
router.post('/resend-verification', authenticate, controller.resendVerification);

module.exports = router;
