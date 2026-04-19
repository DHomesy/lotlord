const invitationService = require('../services/invitationService');
const { cookieOptions, COOKIE_NAME } = require('../config/cookies');
const { resolveOwnerId } = require('../lib/authHelpers');

async function createInvitation(req, res, next) {
  try {
    const { firstName, lastName, email, phone, unitId } = req.body;
    const invitation = await invitationService.createInvitation(
      // resolveOwnerId ensures employee invitations are owned by the employer,
      // so landlords can see/resend/delete them from their own invitation list.
      { invitedBy: resolveOwnerId(req.user), firstName, lastName, email, phone, unitId },
      req.user,
    );
    res.status(201).json(invitation);
  } catch (err) { next(err); }
}

async function createEmployeeInvitation(req, res, next) {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const invitation = await invitationService.createEmployeeInvitation(
      { invitedBy: req.user.sub, firstName, lastName, email, phone },
      req.user,
    );
    res.status(201).json(invitation);
  } catch (err) { next(err); }
}

async function listInvitations(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    // Landlords and employees see only their employer's invitations; admins see all
    const invitedBy = (req.user.role === 'landlord' || req.user.role === 'employee') ? resolveOwnerId(req.user) : null;
    const invitations = await invitationService.listInvitations({
      page: Number(page),
      limit: Number(limit),
      invitedBy,
    });
    res.json(invitations);
  } catch (err) { next(err); }
}

/** Public — validates the token and returns pre-fill data for the signup form. */
async function getInvitation(req, res, next) {
  try {
    const data = await invitationService.getInvitation(req.body.token);
    res.json(data);
  } catch (err) { next(err); }
}

/**
 * Public — tenant completes signup.
 * Sets the httpOnly refresh cookie exactly like authController.login
 * so the standard /auth/refresh flow works immediately.
 */
async function acceptInvitation(req, res, next) {
  try {
    const token = req.body.token;
    const { firstName, lastName, email, password, phone, emailOptIn, smsOptIn, acceptedTerms } = req.body;
    const acceptedTermsAt = acceptedTerms === true ? new Date() : null;
    const { user, token: accessToken, refreshToken, tenant } = await invitationService.acceptInvitation(
      token,
      { firstName, lastName, email, password, phone, emailOptIn: !!emailOptIn, smsOptIn: !!smsOptIn, acceptedTermsAt },
    );
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions());
    res.status(201).json({ user, token: accessToken, tenant });
  } catch (err) { next(err); }
}

async function resendInvitation(req, res, next) {
  try {
    const result = await invitationService.resendInvitation(req.params.id, req.user);
    res.json(result);
  } catch (err) { next(err); }
}

async function deleteInvitation(req, res, next) {
  try {
    await invitationService.deleteInvitation(req.params.id, req.user);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { createInvitation, createEmployeeInvitation, listInvitations, getInvitation, acceptInvitation, resendInvitation, deleteInvitation };
