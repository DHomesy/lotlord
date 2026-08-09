jest.mock('../../src/dal/conversationRepository');
jest.mock('../../src/dal/unmatchedInboundRepository');
jest.mock('../../src/services/conversationService');
jest.mock('../../src/lib/authHelpers');

const unmatchedInboundRepo   = require('../../src/dal/unmatchedInboundRepository');
const {
  listUnmatchedInbound,
  updateUnmatchedInbound,
} = require('../../src/controllers/inboxController');

function makeReq({ params = {}, body = {}, query = {}, user = {} } = {}) {
  return { params, body, query, user };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const next = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('unmatched inbound queue endpoints', () => {
  test('listUnmatchedInbound returns filtered rows for valid status', async () => {
    const rows = [{ id: 'u1', status: 'open' }];
    unmatchedInboundRepo.list.mockResolvedValue(rows);

    const req = makeReq({ query: { status: 'open', page: '1', limit: '10' }, user: { role: 'admin' } });
    const res = makeRes();

    await listUnmatchedInbound(req, res, next);

    expect(unmatchedInboundRepo.list).toHaveBeenCalledWith({ status: 'open', page: 1, limit: 10 });
    expect(res.json).toHaveBeenCalledWith(rows);
  });

  test('listUnmatchedInbound returns 400 for invalid status', async () => {
    const req = makeReq({ query: { status: 'bad' }, user: { role: 'admin' } });
    const res = makeRes();

    await listUnmatchedInbound(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(unmatchedInboundRepo.list).not.toHaveBeenCalled();
  });

  test('updateUnmatchedInbound resolves item with reviewer id', async () => {
    const updated = { id: 'u1', status: 'resolved' };
    unmatchedInboundRepo.updateStatus.mockResolvedValue(updated);

    const req = makeReq({
      params: { id: 'u1' },
      body: { status: 'resolved', notes: 'verified test sender' },
      user: { role: 'admin', sub: 'admin-uuid' },
    });
    const res = makeRes();

    await updateUnmatchedInbound(req, res, next);

    expect(unmatchedInboundRepo.updateStatus).toHaveBeenCalledWith('u1', {
      status: 'resolved',
      notes: 'verified test sender',
      reviewedBy: 'admin-uuid',
    });
    expect(res.json).toHaveBeenCalledWith(updated);
  });
});