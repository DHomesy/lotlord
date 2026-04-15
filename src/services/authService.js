const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const userRepo = require('../dal/userRepository');
const { getClient } = require('../config/db');
const tenantRepo = require('../dal/tenantRepository');
const passwordResetRepo = require('../dal/passwordResetRepository');
const emailVerifyRepo = require('../dal/emailVerificationRepository');
const notificationRepo = require('../dal/notificationRepository');
const { sendEmail } = require('../integrations/email');
const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, FRONTEND_URL } = require('../config/env');

// Refresh tokens use a dedicated secret so a compromised access-token secret cannot be used
// to forge refresh tokens (and vice-versa). Falls back to a derived value for deployments
// that don't yet have JWT_REFRESH_SECRET set.
const REFRESH_SECRET = JWT_REFRESH_SECRET || (JWT_SECRET + '_refresh');

/** Escape HTML entities to prevent injection in email bodies. */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Short-lived access token — stored in memory on the client. */
function signToken(user) {
  return jwt.sign(
    {
      sub:           user.id,
      email:         user.email,
      role:          user.role,
      firstName:     user.first_name || null,
      // Include verification status so middleware can check without a DB query
      emailVerified: !!user.email_verified_at,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

/** Long-lived refresh token — sent only as an httpOnly cookie. Uses REFRESH_SECRET. */
function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh', tokenVersion: user.token_version ?? 0 },
    REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN },
  );
}

async function register({ email, password, firstName, lastName, phone, role, acceptedTermsAt }) {
  if (!acceptedTermsAt) {
    const err = new Error('You must accept the Terms of Service to create an account');
    err.status = 400;
    throw err;
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const normalizedRole = role === 'tenant' ? 'tenant' : 'landlord';

  const dbClient = await getClient();
  let user;
  try {
    await dbClient.query('BEGIN');
    user = await userRepo.create({ id: uuidv4(), email, passwordHash, role: normalizedRole, firstName, lastName, phone, acceptedTermsAt }, dbClient);
    if (normalizedRole === 'tenant') {
      await tenantRepo.create({ id: uuidv4(), userId: user.id }, dbClient);
    } else {
      await userRepo.updateBillingStatus(user.id, { subscriptionStatus: 'free', subscriptionPlan: 'free' }, dbClient);
    }
    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // Seed default notification templates on first landlord registration (fire-and-forget)
  if (normalizedRole === 'landlord') {
    seedDefaultTemplates().catch((err) =>
      console.warn('[auth] default template seed failed:', err.message),
    );
  }

  // Send verification email to new landlords (fire-and-forget — don't block registration)
  if (normalizedRole === 'landlord') {
    sendVerificationEmail(user).catch((err) =>
      console.warn('[auth] verification email failed:', err.message),
    );
  }

  return { user, token: signToken(user), refreshToken: signRefreshToken(user) };
}

async function login({ email, password }) {
  const user = await userRepo.findByEmail(email);
  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  // Strip password_hash before returning
  const { password_hash, ...safeUser } = user;
  const accessToken  = signToken(safeUser);
  const refreshToken = signRefreshToken(safeUser);
  return { user: safeUser, token: accessToken, refreshToken };
}

/**
 * Verify a refresh token JWT (from httpOnly cookie) and issue a new access token.
 * Also rotates the refresh token — the controller must set the new cookie.
 */
async function refreshFromCookie(cookieValue) {
  if (!cookieValue) {
    const err = new Error('No refresh token'); err.status = 401; throw err;
  }

  let payload;
  try {
    payload = jwt.verify(cookieValue, REFRESH_SECRET);
  } catch {
    const err = new Error('Refresh token invalid or expired'); err.status = 401; throw err;
  }

  if (payload.type !== 'refresh') {
    const err = new Error('Invalid token type'); err.status = 401; throw err;
  }

  const user = await userRepo.findById(payload.sub);
  if (!user) {
    const err = new Error('User not found'); err.status = 401; throw err;
  }

  // Verify token version — incremented on logout to invalidate all prior refresh tokens
  if ((payload.tokenVersion ?? 0) !== user.token_version) {
    const err = new Error('Refresh token has been revoked. Please log in again.'); err.status = 401; throw err;
  }

  return {
    user,
    token:        signToken(user),
    refreshToken: signRefreshToken(user), // rotated
  };
}

/**
 * Initiate a password reset.
 * Always responds with a generic message — never reveal whether the email exists.
 * @returns {string} A generic success message safe to return to the client.
 */
async function forgotPassword(email) {
  const user = await userRepo.findByEmail(email);

  // Don't reveal if the email exists — silently succeed
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await passwordResetRepo.create({ id: uuidv4(), userId: user.id, token, expiresAt });

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
  const firstName = escapeHtml(user.first_name || 'there');

  try {
    await sendEmail({
      to: email,
      subject: 'Reset your password',
      html: `
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to choose a new one:</p>
        <p><a href="${resetUrl}" style="font-size:16px;">Reset Password →</a></p>
        <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.</p>
        <p style="color:#888;font-size:12px;">For security, this link can only be used once.</p>
      `,
      text: `Hi ${firstName}, reset your password here (expires in 1 hour): ${resetUrl}`,
    });
  } catch (sesErr) {
    console.error('[auth] forgotPassword: email delivery failed:', sesErr.message);
    const err = new Error('We were unable to send the reset email. Please try again in a few minutes.');
    err.status = 503;
    throw err;
  }
}

/**
 * Complete a password reset using the token from the email link.
 * Marks the token as used and invalidates all other tokens for that user.
 */
async function resetPassword(token, newPassword) {
  const row = await passwordResetRepo.findValidToken(token);
  if (!row) {
    const err = new Error('This reset link is invalid or has expired. Please request a new one.');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await userRepo.updatePassword(row.user_id, passwordHash);

  // Invalidate all reset tokens for this user (mark used + delete)
  await passwordResetRepo.markUsed(token);
  await passwordResetRepo.deleteForUser(row.user_id);
}

// ── Default template seeding ─────────────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    event: 'rent_due',
    emailSubject: 'Rent Due Tomorrow — {{unit}}',
    emailBody: 'Hi {{first_name}},\n\nThis is a friendly reminder that your rent of {{amount}} is due tomorrow ({{due_date}}).\n\nPlease log in to your tenant portal to make a payment.\n\nThank you,\n{{property}}',
    smsBody: 'Hi {{first_name}}, your rent of {{amount}} is due tomorrow ({{due_date}}). Log in to pay.',
  },
  {
    event: 'rent_overdue',
    emailSubject: 'Rent Overdue — {{unit}}',
    emailBody: 'Hi {{first_name}},\n\nYour rent of {{amount}} was due on {{due_date}} and has not been received. Please log in to your tenant portal to make a payment as soon as possible.\n\nIf you believe this is an error, please contact us.\n\n{{property}}',
    smsBody: 'Hi {{first_name}}, your rent of {{amount}} was due on {{due_date}} and is now overdue. Please log in to pay.',
  },
  {
    event: 'late_fee_applied',
    emailSubject: 'Late Fee Applied — {{unit}}',
    emailBody: 'Hi {{first_name}},\n\nA late fee of {{amount}} has been applied to your account because your rent was not received by the due date.\n\nPlease log in to your tenant portal to view your balance and make a payment.\n\n{{property}}',
    smsBody: 'Hi {{first_name}}, a late fee of {{amount}} has been added to your account. Log in to your portal to pay.',
  },
  {
    event: 'lease_expiring',
    emailSubject: 'Your Lease is Expiring Soon — {{unit}}',
    emailBody: 'Hi {{first_name}},\n\nYour lease for {{unit}} at {{property}} is expiring in {{days_remaining}} days ({{due_date}}).\n\nPlease contact your landlord to discuss renewal options.',
    smsBody: 'Hi {{first_name}}, your lease for {{unit}} expires in {{days_remaining}} days. Please contact your landlord about renewal.',
  },
  {
    event: 'payment_received',
    emailSubject: 'Payment Received — Thank You',
    emailBody: 'Hi {{first_name}},\n\nWe have received your payment of {{amount}} on {{due_date}}. Thank you!\n\n{{property}}',
    smsBody: 'Hi {{first_name}}, your payment of {{amount}} has been received. Thank you!',
  },
];

/**
 * Seed the 5 default notification templates (email + SMS per event).
 * Only creates a template if that trigger_event + channel combo doesn't exist yet.
 * Safe to call multiple times — idempotent.
 */
async function seedDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    const existingEmail = await notificationRepo.findTemplateByEvent(t.event, 'email');
    if (!existingEmail) {
      await notificationRepo.createTemplate({
        id: uuidv4(),
        name: `Default — ${t.event.replace(/_/g, ' ')} (email)`,
        channel: 'email',
        triggerEvent: t.event,
        subject: t.emailSubject,
        bodyTemplate: t.emailBody,
      });
    }

    const existingSms = await notificationRepo.findTemplateByEvent(t.event, 'sms');
    if (!existingSms) {
      await notificationRepo.createTemplate({
        id: uuidv4(),
        name: `Default — ${t.event.replace(/_/g, ' ')} (sms)`,
        channel: 'sms',
        triggerEvent: t.event,
        subject: null,
        bodyTemplate: t.smsBody,
      });
    }
  }
}

/**
 * Generate and store a verification token, then send the confirmation email.
 * Safe to call multiple times (resend flow) — issues a fresh 24-hour token each call.
 */
async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await emailVerifyRepo.setVerifyToken(user.id, token, expiresAt);

  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
  const firstName = escapeHtml(user.first_name || 'there');

  await sendEmail({
    to: user.email,
    subject: 'Verify your LotLord email address',
    html: `
      <p>Hi ${firstName},</p>
      <p>Welcome to LotLord! Please verify your email address to activate your account:</p>
      <p><a href="${verifyUrl}" style="font-size:16px;">Verify Email Address &rarr;</a></p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      <p style="color:#888;font-size:12px;">If you did not create a LotLord account, you can safely ignore this email.</p>
    `,
    text: `Hi ${firstName}, verify your email here (expires in 24 hours): ${verifyUrl}`,
  });
}

/**
 * Confirm the token from the verification email link.
 * Returns the user row for immediate auto-login if needed.
 */
async function verifyEmail(token) {
  const user = await emailVerifyRepo.findValidToken(token);
  if (!user) {
    const err = new Error('This verification link is invalid or has expired. Please request a new one.');
    err.status = 400;
    throw err;
  }
  await emailVerifyRepo.markVerified(user.id);
  return user;
}

/**
 * Resend a verification email for the authenticated (but unverified) user.
 */
async function resendVerificationEmail(userId) {
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = new Error('User not found'); err.status = 404; throw err;
  }
  if (user.email_verified_at) {
    const err = new Error('Email is already verified'); err.status = 400; throw err;
  }
  await sendVerificationEmail(user);
}

/**
 * Issue a fresh access + refresh token pair for a user by ID.
 * Used after email verification to hand the client a token with emailVerified: true.
 */
async function issueTokensForUser(userId) {
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = new Error('User not found'); err.status = 404; throw err;
  }
  return { token: signToken(user), refreshToken: signRefreshToken(user) };
}

/**
 * Invalidate all outstanding refresh tokens for a user by incrementing their token_version.
 * Called on explicit logout. Silently ignores missing or expired cookies.
 */
async function logoutUser(cookieValue) {
  if (!cookieValue) return;
  try {
    const payload = jwt.verify(cookieValue, REFRESH_SECRET);
    if (payload?.sub && payload?.type === 'refresh') {
      await userRepo.incrementTokenVersion(payload.sub);
    }
  } catch { /* expired or invalid — nothing to revoke */ }
}

module.exports = { register, login, refreshFromCookie, forgotPassword, resetPassword, verifyEmail, resendVerificationEmail, issueTokensForUser, logoutUser };
