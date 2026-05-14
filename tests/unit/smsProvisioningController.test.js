/**
 * Unit tests for A5 — SMS Provisioning API endpoints.
 *
 * Tests the three controller functions (getMySmsStatus, provisionMySms, deprovisionMySms)
 * and the updateMe controller (AI config PATCH /me).
 *
 * All service / repo calls are mocked — no DB or Twilio API required.
 *
 * Run: npm run test:unit
 */

jest.mock('../../src/services/twilioService');
jest.mock('../../src/dal/userRepository');

const twilioService = require('../../src/services/twilioService');
const userRepo      = require('../../src/dal/userRepository');

const {
  getMySmsStatus,
  provisionMySms,
  deprovisionMySms,
  updateMe,
} = require('../../src/controllers/userController');

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    user: { sub: 'landlord-uuid', role: 'landlord' },
    body: {},
    params: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.send   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getMySmsStatus ────────────────────────────────────────────────────────────

describe('getMySmsStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the provisioning status from twilioService', async () => {
    const status = { provisioned: true, phoneNumber: '+15125550001', messagingServiceSid: 'MG123' };
    twilioService.getProvisioningStatus.mockResolvedValue(status);

    const req = mockReq();
    const res = mockRes();
    await getMySmsStatus(req, res, jest.fn());

    expect(twilioService.getProvisioningStatus).toHaveBeenCalledWith('landlord-uuid');
    expect(res.json).toHaveBeenCalledWith(status);
  });

  it('returns unprovisioned status', async () => {
    twilioService.getProvisioningStatus.mockResolvedValue({ provisioned: false, phoneNumber: null, messagingServiceSid: null });

    const req = mockReq();
    const res = mockRes();
    await getMySmsStatus(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ provisioned: false }));
  });

  it('calls next(err) on unexpected error', async () => {
    twilioService.getProvisioningStatus.mockRejectedValue(new Error('DB down'));

    const req  = mockReq();
    const res  = mockRes();
    const next = jest.fn();
    await getMySmsStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'DB down' }));
  });
});

// ── provisionMySms ────────────────────────────────────────────────────────────

describe('provisionMySms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 201 with phone number on success', async () => {
    const result = { phoneNumber: '+15125550001', messagingServiceSid: 'MG123' };
    twilioService.provisionSmsNumber.mockResolvedValue(result);

    const req = mockReq({ body: { areaCode: '512' } });
    const res = mockRes();
    await provisionMySms(req, res, jest.fn());

    expect(twilioService.provisionSmsNumber).toHaveBeenCalledWith('landlord-uuid', '512');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('returns 409 when already provisioned', async () => {
    const err = Object.assign(new Error('Already provisioned'), { status: 409 });
    twilioService.provisionSmsNumber.mockRejectedValue(err);

    const req = mockReq({ body: { areaCode: '512' } });
    const res = mockRes();
    await provisionMySms(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Already provisioned' }));
  });

  it('returns 422 with code when no numbers in area code', async () => {
    const err = Object.assign(new Error('No numbers available'), { status: 422, code: 'NO_NUMBERS_IN_AREA_CODE' });
    twilioService.provisionSmsNumber.mockRejectedValue(err);

    const req = mockReq({ body: { areaCode: '999' } });
    const res = mockRes();
    await provisionMySms(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'No numbers available', code: 'NO_NUMBERS_IN_AREA_CODE' });
  });

  it('calls next(err) on unexpected error (no .status property)', async () => {
    twilioService.provisionSmsNumber.mockRejectedValue(new Error('Twilio network error'));

    const req  = mockReq({ body: { areaCode: '512' } });
    const res  = mockRes();
    const next = jest.fn();
    await provisionMySms(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ── deprovisionMySms ──────────────────────────────────────────────────────────

describe('deprovisionMySms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 204 on successful deprovisioning', async () => {
    twilioService.deprovisionSmsNumber.mockResolvedValue(undefined);

    const req = mockReq();
    const res = mockRes();
    await deprovisionMySms(req, res, jest.fn());

    expect(twilioService.deprovisionSmsNumber).toHaveBeenCalledWith('landlord-uuid');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('returns 404 when landlord has no provisioned number', async () => {
    const err = Object.assign(new Error('No SMS number provisioned'), { status: 404 });
    twilioService.deprovisionSmsNumber.mockRejectedValue(err);

    const req = mockReq();
    const res = mockRes();
    await deprovisionMySms(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'No SMS number provisioned' }));
  });

  it('calls next(err) on unexpected error', async () => {
    twilioService.deprovisionSmsNumber.mockRejectedValue(new Error('Twilio error'));

    const req  = mockReq();
    const res  = mockRes();
    const next = jest.fn();
    await deprovisionMySms(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ── updateMe (AI config) ──────────────────────────────────────────────────────

describe('updateMe', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates AI config fields and returns the updated user', async () => {
    const updated = {
      id: 'landlord-uuid', email: 'landlord@test.com', role: 'landlord',
      ai_enabled: false, ai_reply_mode: 'auto', ai_notify_on_send: false, ai_notify_channels: ['email'],
    };
    userRepo.update.mockResolvedValue(updated);

    const req = mockReq({
      body: { aiEnabled: false, aiReplyMode: 'auto', aiNotifyOnSend: false, aiNotifyChannels: ['email'] },
    });
    const res = mockRes();
    await updateMe(req, res, jest.fn());

    expect(userRepo.update).toHaveBeenCalledWith('landlord-uuid', expect.objectContaining({
      ai_enabled:         false,
      ai_reply_mode:      'auto',
      ai_notify_on_send:  false,
      ai_notify_channels: ['email'],
    }));
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('updates basic profile fields', async () => {
    const updated = { id: 'landlord-uuid', first_name: 'John', last_name: 'Doe' };
    userRepo.update.mockResolvedValue(updated);

    const req = mockReq({ body: { firstName: 'John', lastName: 'Doe' } });
    const res = mockRes();
    await updateMe(req, res, jest.fn());

    expect(userRepo.update).toHaveBeenCalledWith('landlord-uuid', expect.objectContaining({
      first_name: 'John',
      last_name:  'Doe',
    }));
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('returns 404 if user not found', async () => {
    userRepo.update.mockResolvedValue(null);

    const req = mockReq({ body: { aiEnabled: true } });
    const res = mockRes();
    await updateMe(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('calls next(err) on unexpected error', async () => {
    userRepo.update.mockRejectedValue(new Error('DB error'));

    const req  = mockReq({ body: { aiEnabled: true } });
    const res  = mockRes();
    const next = jest.fn();
    await updateMe(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'DB error' }));
  });
});
