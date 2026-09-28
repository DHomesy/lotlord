jest.mock('../../src/dal/ledgerRepository', () => ({
  findOverdueUnpaidCharges: jest.fn(),
}));
jest.mock('../../src/services/ledgerService', () => ({
  applyLateFee: jest.fn(),
}));
jest.mock('../../src/services/notificationService', () => ({
  sendAllChannels: jest.fn(),
}));

const ledgerRepo = require('../../src/dal/ledgerRepository');
const ledgerService = require('../../src/services/ledgerService');
const notificationService = require('../../src/services/notificationService');
const lateFeeJob = require('../../src/jobs/lateFee');

describe('late fee notification details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    ledgerRepo.findOverdueUnpaidCharges.mockResolvedValue([{
      lease_id: 'lease-1',
      user_id: 'tenant-user-1',
      first_name: 'Taylor',
      last_name: 'Tenant',
      rent_amount: '1250.00',
      due_date: new Date('2026-09-01T00:00:00.000Z'),
      unit_number: '4B',
      property_name: 'Maple Place',
      address_line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      landlord_first_name: 'Aston',
      landlord_last_name: 'Smith',
    }]);
    ledgerService.applyLateFee.mockResolvedValue({
      fee: 50,
      appliedDate: '2026-09-28',
    });
    notificationService.sendAllChannels.mockResolvedValue({ id: 'notification-1' });
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('passes the original rent obligation, fee date, owner, and address', async () => {
    await lateFeeJob.run();

    expect(notificationService.sendAllChannels).toHaveBeenCalledWith({
      triggerEvent: 'late_fee_applied',
      recipientId: 'tenant-user-1',
      variables: expect.objectContaining({
        rent_amount: '$1250.00',
        original_due_date: '2026-09-01',
        late_fee_date: '2026-09-28',
        amount: '$50.00',
        landlord_name: 'Aston Smith',
        property_address: '123 Main St, Austin, TX 78701',
      }),
    });
  });
});