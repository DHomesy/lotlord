/**
 * Invitation Service
 * ------------------
 * Manages the full tenant self-signup flow:
 *   Admin send invite  → createInvitation()
 *   Tenant loads link  → getInvitation()
 *   Tenant submits form → acceptInvitation()
 *
 * No user or tenant record is created until the tenant accepts.
 * The landlord never sees or handles a password.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const invitationRepo = require('../dal/invitationRepository');
const userRepo = require('../dal/userRepository');
const tenantRepo = require('../dal/tenantRepository');
const unitRepo = require('../dal/unitRepository');
const propertyRepo = require('../dal/propertyRepository');
const authService = require('./authService');
const { getClient } = require('../config/db');
const { sendEmail } = require('../integrations/email');
const { sendSms } = require('../integrations/twilio');
const { FRONTEND_URL } = require('../config/env');
const { resolveOwnerId } = require('../lib/authHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

function appErr(msg, status) {
  return Object.assign(new Error(msg), { status });
}

/** Escape HTML entities to prevent HTML injection in email bodies. */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Service methods ───────────────────────────────────────────────────────────

/**
 * Create and dispatch an invitation.
 * - Stores a pending row in tenant_invitations (no user created yet)
 * - Sends email and/or SMS with the unique signup link
 */
async function createInvitation({ invitedBy, firstName, lastName, email, phone, unitId }, user) {
  if (!email && !phone) {
    throw appErr('At least one of email or phone is required to send an invitation', 400);
  }

  // Validate unit ownership before creating the invitation
  if (unitId && (user?.role === 'landlord' || user?.role === 'employee')) {
    const unit = await unitRepo.findById(unitId);
    if (!unit) throw appErr('Unit not found', 404);
    const property = await propertyRepo.findById(unit.property_id);
    if (!property || property.owner_id !== resolveOwnerId(user)) {
      throw appErr('You do not have permission to invite tenants to this unit', 403);
    }
  }

  // ── Duplicate guards ───────────────────────────────────────────────────────
  if (email) {
    // Prevent inviting someone who already has an account
    const existingUser = await userRepo.findByEmail(email);
    if (existingUser) {
      throw appErr(`A user with email ${email} already exists.`, 409);
    }

    // Prevent duplicate pending invitations to the same address
    const pendingInvite = await invitationRepo.findPendingByEmail(email);
    if (pendingInvite) {
      throw appErr(
        `A pending invitation was already sent to ${email}. Use the resend button to send a fresh link.`,
        409,
      );
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await invitationRepo.create({
    id: uuidv4(),
    token,
    invitedBy,
    firstName,
    lastName,
    email,
    phone,
    unitId: unitId || null,
    expiresAt,
    type: 'tenant',
  });

  const signupUrl = `${FRONTEND_URL}/accept-invite/${token}`;
  const name = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';

  // Resolve landlord display name for the email
  let landlordName = 'Your landlord';
  if (invitedBy) {
    try {
      const landlord = await userRepo.findById(invitedBy);
      if (landlord) {
        const full = [landlord.first_name, landlord.last_name].filter(Boolean).join(' ');
        if (full) landlordName = escapeHtml(full);
      }
    } catch (_) { /* non-fatal */ }
  }

  // Delivery failures are non-fatal — the invitation row is already saved and
  // the admin can share the link manually. Catch and surface as a warning.
  const deliveryErrors = [];

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: "You've been invited to your rental portal",
        html: `
          <p>${name}</p>
          <p>${landlordName} has invited you to set up access to your rental account.</p>
          <p>Click the link below to create your account. This link expires in <strong>7 days</strong>.</p>
          <p><a href="${signupUrl}" style="font-size:16px;">Accept Invitation →</a></p>
          <p style="color:#888;font-size:12px;">If you did not expect this email, you can safely ignore it.</p>
          <p style="color:#888;font-size:12px;">Sent on behalf of ${landlordName} via LotLord.</p>
        `,
        text: `${name} ${landlordName} has invited you to your rental portal. Sign up here: ${signupUrl} (expires in 7 days)`,
      });
    } catch (err) {
      console.error('[invitations] email delivery failed:', err.message);
      deliveryErrors.push({ channel: 'email', message: err.message });
    }
  }

  if (phone) {
    try {
      await sendSms({
        to: phone,
        body: `You've been invited to your rental portal. Set up your account here: ${signupUrl}`,
      });
    } catch (err) {
      console.error('[invitations] SMS delivery failed:', err.message);
      deliveryErrors.push({ channel: 'sms', message: err.message });
    }
  }

  return {
    ...invitation,
    signupUrl,
    ...(deliveryErrors.length > 0 && { deliveryWarning: deliveryErrors }),
  };
}

/**
 * Validate a token and return the pre-fill data for the signup form.
 * Returns a limited set of fields — never the full row (no invited_by etc.).
 */
async function getInvitation(token) {
  const inv = await invitationRepo.findByToken(token);

  if (!inv) throw appErr('Invitation not found or has already been used', 404);
  if (inv.accepted_at) throw appErr('This invitation has already been accepted', 410);
  if (new Date(inv.expires_at) < new Date()) throw appErr('This invitation link has expired', 410);

  return {
    type:            inv.type ?? 'tenant',
    firstName:       inv.first_name,
    lastName:        inv.last_name,
    email:           inv.email,
    unitNumber:      inv.unit_number,
    propertyName:    inv.property_name,
    propertyAddress: inv.property_address,
    expiresAt:       inv.expires_at,
  };
}

/**
 * Complete signup: tenant fills out the form, we create the user + tenant record.
 * Returns { user, token, refreshToken, tenant } — controller sets the cookie.
 */
async function acceptInvitation(token, { firstName, lastName, email, password, phone, emailOptIn = false, smsOptIn = false, acceptedTermsAt = null }) {
  if (!acceptedTermsAt) {
    throw appErr('You must accept the Terms of Service to complete signup', 400);
  }

  const inv = await invitationRepo.findByToken(token);

  // Re-validate (same checks as getInvitation)
  if (!inv) throw appErr('Invitation not found or has already been used', 404);
  if (inv.accepted_at) throw appErr('This invitation has already been accepted', 410);
  if (new Date(inv.expires_at) < new Date()) throw appErr('This invitation link has expired', 410);

  // Resolve email: tenant may provide one even if the invite had none
  const resolvedEmail = email || inv.email;
  if (!resolvedEmail) throw appErr('An email address is required', 400);

  const existing = await userRepo.findByEmail(resolvedEmail);
  if (existing) throw appErr('An account with this email already exists. Please log in instead.', 409);

  // Create the user account — password is set entirely by the tenant
  const passwordHash = await bcrypt.hash(password, 12);

  const dbClient = await getClient();
  let user, tenant;
  try {
    await dbClient.query('BEGIN');

    if (inv.type === 'employee') {
      // Employee invite: create a user with role='employee', linked to the inviting landlord
      user = await userRepo.create({
        id: uuidv4(),
        email: resolvedEmail,
        passwordHash,
        role: 'employee',
        firstName: firstName || inv.first_name || '',
        lastName: lastName || inv.last_name || '',
        phone: phone || inv.phone || null,
        acceptedTermsAt,
        employerId: inv.invited_by,
      }, dbClient);
      // No tenant record for employees
      await invitationRepo.accept(token, null, dbClient);
    } else {
      user = await userRepo.create({
        id: uuidv4(),
        email: resolvedEmail,
        passwordHash,
        role: 'tenant',
        firstName: firstName || inv.first_name || '',
        lastName: lastName || inv.last_name || '',
        phone: phone || inv.phone || null,
        acceptedTermsAt,
      }, dbClient);

      // Create the tenant record linked to the new user, storing their opt-in choices
      tenant = await tenantRepo.create({
        id: uuidv4(),
        userId: user.id,
        emailOptIn,
        smsOptIn,
      }, dbClient);

      // Backfill invitation with the new tenant id + mark accepted
      await invitationRepo.accept(token, tenant.id, dbClient);
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  const { token: accessToken, refreshToken } = await authService.issueTokensForUser(user.id);

  return { user, token: accessToken, refreshToken, tenant };
}

async function listInvitations({ page, limit, invitedBy = null }) {
  return invitationRepo.findAll({ page, limit, invitedBy });
}

/**
 * Re-send an existing invitation.
 * - Generates a fresh token + extends expiry 7 days from now
 * - Re-fires email and/or SMS to the original contacts
 * - Can resend even if the link was expired (useful recovery path)
 * - Cannot resend once the invitation has been accepted
 */
async function resendInvitation(id, user) {
  const inv = await invitationRepo.findById(id);

  if (!inv) throw appErr('Invitation not found', 404);
  if ((user?.role === 'landlord' || user?.role === 'employee') && inv.invited_by !== resolveOwnerId(user)) {
    throw appErr('Forbidden', 403);
  }
  if (inv.accepted_at) throw appErr('This invitation has already been accepted and cannot be resent', 409);

  const token     = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fresh 7 days

  const updated   = await invitationRepo.refreshToken(id, token, expiresAt);
  const signupUrl = `${FRONTEND_URL}/accept-invite/${token}`;
  const name      = inv.first_name ? `Hi ${escapeHtml(inv.first_name)},` : 'Hi there,';

  // Resolve landlord display name for the email
  let landlordName = 'Your landlord';
  if (inv.invited_by) {
    try {
      const landlord = await userRepo.findById(inv.invited_by);
      if (landlord) {
        const full = [landlord.first_name, landlord.last_name].filter(Boolean).join(' ');
        if (full) landlordName = escapeHtml(full);
      }
    } catch (_) { /* non-fatal */ }
  }

  const deliveryErrors = [];

  if (inv.email) {
    try {
      await sendEmail({
        to:      inv.email,
        subject: "Reminder: You've been invited to your rental portal",
        html: `
          <p>${name}</p>
          <p>This is a reminder from ${landlordName} to set up access to your rental account.</p>
          <p>Click the link below to create your account. This link expires in <strong>7 days</strong>.</p>
          <p><a href="${signupUrl}" style="font-size:16px;">Accept Invitation →</a></p>
          <p style="color:#888;font-size:12px;">If you did not expect this email, you can safely ignore it.</p>
          <p style="color:#888;font-size:12px;">Sent on behalf of ${landlordName} via LotLord.</p>
        `,
        text: `${name} Reminder from ${landlordName}: you've been invited to your rental portal. Sign up here: ${signupUrl} (expires in 7 days)`,
      });
    } catch (err) {
      console.error('[invitations] resend email delivery failed:', err.message);
      deliveryErrors.push({ channel: 'email', message: err.message });
    }
  }

  if (inv.phone) {
    try {
      await sendSms({
        to:   inv.phone,
        body: `Reminder: you've been invited to your rental portal. Set up your account here: ${signupUrl}`,
      });
    } catch (err) {
      console.error('[invitations] resend SMS delivery failed:', err.message);
      deliveryErrors.push({ channel: 'sms', message: err.message });
    }
  }

  return {
    ...updated,
    signupUrl,
    ...(deliveryErrors.length > 0 && { deliveryWarning: deliveryErrors }),
  };
}

async function deleteInvitation(id, user) {
  const inv = await invitationRepo.findById(id);
  if (!inv) {
    const err = new Error('Invitation not found');
    err.status = 404;
    throw err;
  }
  if ((user?.role === 'landlord' || user?.role === 'employee') && inv.invited_by !== resolveOwnerId(user)) {
    throw appErr('Forbidden', 403);
  }
  if (inv.accepted_at) {
    const err = new Error('Cannot delete an accepted invitation — the tenant account remains active');
    err.status = 409;
    throw err;
  }
  await invitationRepo.remove(id);
}

/**
 * Create and dispatch an employee invitation.
 * - Landlord/admin only (employees cannot invite other employees)
 * - Creates a tenant_invitations row with type='employee'
 * - Sends an email invite with a signup link
 */
async function createEmployeeInvitation({ invitedBy, firstName, lastName, email, phone }, user) {
  if (!email && !phone) {
    throw appErr('At least one of email or phone is required to send an invitation', 400);
  }

  if (email) {
    const existingUser = await userRepo.findByEmail(email);
    if (existingUser) {
      throw appErr(`A user with email ${email} already exists.`, 409);
    }

    const pendingInvite = await invitationRepo.findPendingByEmail(email);
    if (pendingInvite) {
      throw appErr(
        `A pending invitation was already sent to ${email}. Use the resend button to send a fresh link.`,
        409,
      );
    }
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await invitationRepo.create({
    id: uuidv4(),
    token,
    invitedBy,
    firstName,
    lastName,
    email,
    phone,
    unitId: null,
    expiresAt,
    type: 'employee',
  });

  const signupUrl = `${FRONTEND_URL}/accept-invite/${token}`;
  const name = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';

  let employerName = 'Your employer';
  if (invitedBy) {
    try {
      const employer = await userRepo.findById(invitedBy);
      if (employer) {
        const full = [employer.first_name, employer.last_name].filter(Boolean).join(' ');
        if (full) employerName = escapeHtml(full);
      }
    } catch (_) { /* non-fatal */ }
  }

  const deliveryErrors = [];

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: "You've been invited to join LotLord as a team member",
        html: `
          <p>${name}</p>
          <p>${employerName} has added you as a team member on LotLord property management.</p>
          <p>Click the link below to create your account. This link expires in <strong>7 days</strong>.</p>
          <p><a href="${signupUrl}" style="font-size:16px;">Accept Invitation →</a></p>
          <p style="color:#888;font-size:12px;">If you did not expect this email, you can safely ignore it.</p>
          <p style="color:#888;font-size:12px;">Sent on behalf of ${employerName} via LotLord.</p>
        `,
        text: `${name} ${employerName} has invited you to join LotLord. Create your account here: ${signupUrl} (expires in 7 days)`,
      });
    } catch (err) {
      console.error('[invitations] employee email delivery failed:', err.message);
      deliveryErrors.push({ channel: 'email', message: err.message });
    }
  }

  if (phone) {
    try {
      await sendSms({
        to: phone,
        body: `You've been invited to join LotLord as a team member. Create your account here: ${signupUrl}`,
      });
    } catch (err) {
      console.error('[invitations] employee SMS delivery failed:', err.message);
      deliveryErrors.push({ channel: 'sms', message: err.message });
    }
  }

  return {
    ...invitation,
    signupUrl,
    ...(deliveryErrors.length > 0 && { deliveryWarning: deliveryErrors }),
  };
}

module.exports = { createInvitation, createEmployeeInvitation, getInvitation, acceptInvitation, listInvitations, resendInvitation, deleteInvitation };
