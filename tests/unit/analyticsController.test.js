jest.mock('../../src/dal/analyticsRepository');
jest.mock('../../src/lib/authHelpers');

const analyticsRepo = require('../../src/dal/analyticsRepository');
const { resolveOwnerId } = require('../../src/lib/authHelpers');
const { getDashboard, getOwnerQaQuality } = require('../../src/controllers/analyticsController');

function makeReq({ user = {}, query = {} } = {}) {
  return { user, query };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const next = jest.fn();

describe('analyticsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOwnerId.mockReturnValue('owner-1');
  });

  test('getDashboard uses owner scope for landlord', async () => {
    analyticsRepo.getDashboardMetrics.mockResolvedValue({ monthlyIncome: 1000 });
    const req = makeReq({ user: { role: 'landlord', sub: 'owner-1' } });
    const res = makeRes();

    await getDashboard(req, res, next);

    expect(analyticsRepo.getDashboardMetrics).toHaveBeenCalledWith('owner-1');
    expect(res.json).toHaveBeenCalledWith({ monthlyIncome: 1000 });
  });

  test('getDashboard uses system scope for admin', async () => {
    analyticsRepo.getDashboardMetrics.mockResolvedValue({ monthlyIncome: 3000 });
    const req = makeReq({ user: { role: 'admin', sub: 'admin-1' } });
    const res = makeRes();

    await getDashboard(req, res, next);

    expect(analyticsRepo.getDashboardMetrics).toHaveBeenCalledWith(null);
    expect(res.json).toHaveBeenCalledWith({ monthlyIncome: 3000 });
  });

  test('getOwnerQaQuality uses owner scope for employee', async () => {
    analyticsRepo.getOwnerQaQualityMetrics.mockResolvedValue({ days: 30, byIntent: [] });
    const req = makeReq({ user: { role: 'employee', sub: 'emp-1', ownerId: 'owner-1' }, query: { days: '14' } });
    const res = makeRes();

    await getOwnerQaQuality(req, res, next);

    expect(resolveOwnerId).toHaveBeenCalledWith(req.user);
    expect(analyticsRepo.getOwnerQaQualityMetrics).toHaveBeenCalledWith('owner-1', { days: '14' });
    expect(res.json).toHaveBeenCalledWith({ days: 30, byIntent: [] });
  });

  test('getOwnerQaQuality uses admin system scope', async () => {
    analyticsRepo.getOwnerQaQualityMetrics.mockResolvedValue({ days: 7, byIntent: [] });
    const req = makeReq({ user: { role: 'admin', sub: 'admin-1' }, query: { days: '7' } });
    const res = makeRes();

    await getOwnerQaQuality(req, res, next);

    expect(analyticsRepo.getOwnerQaQualityMetrics).toHaveBeenCalledWith(null, { days: '7' });
    expect(res.json).toHaveBeenCalledWith({ days: 7, byIntent: [] });
  });

  test('getOwnerQaQuality passes repository errors to next', async () => {
    const boom = new Error('repo failed');
    analyticsRepo.getOwnerQaQualityMetrics.mockRejectedValue(boom);
    const req = makeReq({ user: { role: 'landlord', sub: 'owner-1' }, query: {} });
    const res = makeRes();

    await getOwnerQaQuality(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
