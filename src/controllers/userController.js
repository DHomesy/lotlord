const userRepo = require('../dal/userRepository');
const smsProvisioningService = require('../services/smsProvisioningService');
const { resolveOwnerId } = require('../lib/authHelpers');

const ACTIVE_STATUSES = ['active', 'trialing'];

function normalizePlan(plan) {
  if (plan === 'enterprise') return 'autopilot';
  if (plan === 'commercial') return 'portfolio';
  return plan;
}

async function getMe(req, res, next) {
  try {
    const user = await userRepo.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    // Users may only view their own profile; admins may view any user
    if (req.user.role !== 'admin' && req.user.sub !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await userRepo.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
}

async function listUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, role } = req.query;
    const users = await userRepo.findAll({ page: Number(page), limit: Number(limit), role });
    res.json(users);
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    // Users can update themselves; admins can update anyone
    const targetId = req.params.id;
    if (req.user.role !== 'admin' && req.user.sub !== targetId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const updated = await userRepo.update(targetId, {
      first_name: firstName, last_name: lastName, phone, avatar_url: avatarUrl,
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) { next(err); }
}

/**
 * PATCH /api/v1/users/me
 * Self-update: basic profile fields + AI config. Always operates on the authenticated user.
 */
async function updateMe(req, res, next) {
  try {
    const { firstName, lastName, phone, avatarUrl,
            aiEnabled, aiReplyMode, aiNotifyOnSend, aiNotifyChannels } = req.body;

    const aiFieldsTouched = [aiEnabled, aiReplyMode, aiNotifyOnSend, aiNotifyChannels]
      .some((value) => value !== undefined);

    if (aiFieldsTouched) {
      if (req.user.role !== 'admin' && req.user.role !== 'landlord' && req.user.role !== 'employee') {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (req.user.role !== 'admin') {
        const billing = await userRepo.findBillingStatus(resolveOwnerId(req.user));
        const plan = normalizePlan(billing?.subscription_plan);
        const isPaid = ACTIVE_STATUSES.includes(billing?.subscription_status) &&
          (plan === 'autopilot' || plan === 'portfolio');

        if (!isPaid) {
          return res.status(402).json({
            error: 'This feature requires an Autopilot or Portfolio plan. Upgrade to continue.',
            code: 'SUBSCRIPTION_REQUIRED',
          });
        }
      }
    }

    const updated = await userRepo.update(req.user.sub, {
      first_name:         firstName,
      last_name:          lastName,
      phone,
      avatar_url:         avatarUrl,
      ai_enabled:         aiEnabled,
      ai_reply_mode:      aiReplyMode,
      ai_notify_on_send:  aiNotifyOnSend,
      ai_notify_channels: aiNotifyChannels,
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) { next(err); }
}

// ── SMS Provisioning ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/users/me/sms/status
 * Returns the landlord's current SMS provisioning state.
 */
async function getMySmsStatus(req, res, next) {
  try {
    const status = await smsProvisioningService.getProvisioningStatus(req.user.sub);
    res.json(status);
  } catch (err) { next(err); }
}

/**
 * POST /api/v1/users/me/sms/provision
 * Purchase a Twilio number in the requested area code and assign it to this landlord.
 * Body: { areaCode: "512" }
 */
async function provisionMySms(req, res, next) {
  try {
    const result = await smsProvisioningService.provisionSmsNumber(req.user.sub, req.body.areaCode);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
}

/**
 * DELETE /api/v1/users/me/sms/provision
 * Release the landlord's provisioned number and delete the Messaging Service.
 */
async function deprovisionMySms(req, res, next) {
  try {
    await smsProvisioningService.deprovisionSmsNumber(req.user.sub);
    res.status(204).send();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
}

module.exports = { getMe, getUser, listUsers, updateUser, updateMe, getMySmsStatus, provisionMySms, deprovisionMySms };
