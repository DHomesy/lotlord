/**
 * Pure unit tests for auth middleware.
 *
 * No HTTP server, no DB. Uses a hand-rolled mock for req/res/next so these
 * run in milliseconds and catch regressions without any test-DB dependency.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
  };
  return res;
}

function mockNext() {
  const fn = jest.fn();
  return fn;
}

// ── authorize() ──────────────────────────────────────────────────────────────

const { authorize } = require('../src/middleware/auth');

describe('authorize()', () => {
  it('calls next() when user role is in the allowed list', () => {
    const req  = { user: { role: 'landlord' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('returns 403 when user role is NOT in the allowed list', () => {
    const req  = { user: { role: 'tenant' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('returns 403 when req.user is undefined', () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    authorize('landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('allows employee through an employee-permitted route', () => {
    const req  = { user: { role: 'employee' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord', 'employee')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks employee from a landlord-only route', () => {
    const req  = { user: { role: 'employee' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('allows a single allowed role (no spread)', () => {
    const req  = { user: { role: 'admin' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── requiresStarter() ─────────────────────────────────────────────────────────
//
// userRepo.findBillingStatus is the only DB call inside requiresStarter.
// We mock the module so no DB connection is needed.

jest.mock('../src/dal/userRepository', () => ({
  findBillingStatus: jest.fn(),
}));

const { requiresStarter } = require('../src/middleware/auth');
const userRepo = require('../src/dal/userRepository');

describe('requiresStarter()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin bypasses billing check entirely', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('landlord with active subscription passes', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('landlord on trialing subscription passes', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'trialing' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('landlord with no subscription returns 402', async () => {
    userRepo.findBillingStatus.mockResolvedValue(null);

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
    expect(res._body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('landlord with cancelled subscription returns 402', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'canceled' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
  });

  it('employee billing check uses employerId (employer plan), not employee sub', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active' });

    const req = {
      user: { role: 'employee', sub: 'employee-own-id', employerId: 'employer-id' },
    };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    // Must query employer's billing, not the employee's own row
    expect(userRepo.findBillingStatus).toHaveBeenCalledWith('employer-id');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('employee with no-subscription employer is blocked (402)', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'past_due' });

    const req = {
      user: { role: 'employee', sub: 'employee-own-id', employerId: 'employer-id' },
    };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(res._status).toBe(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is missing', async () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── checkPlanLimit() ──────────────────────────────────────────────────────────

const { checkPlanLimit } = require('../src/middleware/auth');

describe('checkPlanLimit()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin bypasses plan limit check without calling DB', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('admin can add employees regardless of plan (bypass)', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('employees')(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when req.user is missing', async () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws for unsupported resource name', () => {
    expect(() => checkPlanLimit('invoices')).toThrow(/unsupported resource/);
  });
});

// ── resolveOwnerId() ──────────────────────────────────────────────────────────

const { resolveOwnerId } = require('../src/lib/authHelpers');

describe('resolveOwnerId()', () => {
  it('returns sub for a landlord', () => {
    expect(resolveOwnerId({ sub: 'landlord-id', role: 'landlord' })).toBe('landlord-id');
  });

  it('returns sub for an admin', () => {
    expect(resolveOwnerId({ sub: 'admin-id', role: 'admin' })).toBe('admin-id');
  });

  it('returns employerId for an employee', () => {
    expect(resolveOwnerId({ sub: 'emp-id', role: 'employee', employerId: 'employer-id' })).toBe('employer-id');
  });

  it('throws 401 when employee has no employerId claim', () => {
    expect(() => resolveOwnerId({ sub: 'emp-id', role: 'employee' })).toThrow('Employee token missing employerId claim');
  });
});
