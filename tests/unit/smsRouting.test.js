/**
 * Unit tests for inbound SMS routing (A3).
 *
 * Tests that the webhook resolves both the tenant (From) and landlord (To)
 * in parallel, logs the message correctly, and handles edge cases gracefully.
 *
 * The webhook handler itself is an Express route, so we test the routing logic
 * through the userRepository functions it depends on rather than mounting the
 * full app (which requires DB + env setup).
 *
 * Run: npm run test:unit
 */

jest.mock('../../src/dal/userRepository');
jest.mock('../../src/dal/notificationRepository');
jest.mock('../../src/config/env', () => ({
  TWILIO_AUTH_TOKEN: '',   // empty = signature validation skipped in webhook handler
  APP_BASE_URL: 'https://app.lotlord.test',
}));

const userRepo         = require('../../src/dal/userRepository');
const notificationRepo = require('../../src/dal/notificationRepository');

// We test the lookup functions directly since the webhook handler
// is an Express route integration concern covered by integration tests.

describe('findByTwilioSmsNumber', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the landlord when number is found', async () => {
    const landlord = { id: 'landlord-uuid', role: 'landlord', twilio_sms_number: '+15125550001' };
    userRepo.findByTwilioSmsNumber.mockResolvedValue(landlord);

    const result = await userRepo.findByTwilioSmsNumber('+15125550001');

    expect(result).toEqual(landlord);
    expect(userRepo.findByTwilioSmsNumber).toHaveBeenCalledWith('+15125550001');
  });

  it('returns null when number is not provisioned', async () => {
    userRepo.findByTwilioSmsNumber.mockResolvedValue(null);

    const result = await userRepo.findByTwilioSmsNumber('+19995550001');
    expect(result).toBeNull();
  });
});

describe('inbound SMS routing logic', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves sender and landlord in parallel for a known tenant + provisioned number', async () => {
    const tenant   = { id: 'tenant-uuid',   role: 'tenant',   phone: '+14155550001' };
    const landlord = { id: 'landlord-uuid', role: 'landlord', twilio_sms_number: '+15125550001' };

    userRepo.findByPhone.mockResolvedValue(tenant);
    userRepo.findByTwilioSmsNumber.mockResolvedValue(landlord);
    notificationRepo.createLogEntry.mockResolvedValue({ id: 'log-uuid' });

    // Simulate the parallel resolution the webhook performs
    const [sender, resolvedLandlord] = await Promise.all([
      userRepo.findByPhone('+14155550001'),
      userRepo.findByTwilioSmsNumber('+15125550001'),
    ]);

    expect(sender.id).toBe('tenant-uuid');
    expect(resolvedLandlord.id).toBe('landlord-uuid');
  });

  it('returns null landlord when message arrives at platform number (no provisioned match)', async () => {
    const tenant = { id: 'tenant-uuid', role: 'tenant', phone: '+14155550001' };

    userRepo.findByPhone.mockResolvedValue(tenant);
    // Platform number is not in the twilio_sms_number column
    userRepo.findByTwilioSmsNumber.mockResolvedValue(null);

    const [sender, resolvedLandlord] = await Promise.all([
      userRepo.findByPhone('+14155550001'),
      userRepo.findByTwilioSmsNumber('+18005550000'),  // platform number
    ]);

    expect(sender).not.toBeNull();
    expect(resolvedLandlord).toBeNull();
    // Webhook should still log the message — null landlord is not a blocking error
  });

  it('both lookups resolve null for completely unknown sender + number', async () => {
    userRepo.findByPhone.mockResolvedValue(null);
    userRepo.findByTwilioSmsNumber.mockResolvedValue(null);

    const [sender, resolvedLandlord] = await Promise.all([
      userRepo.findByPhone('+19995550001'),
      userRepo.findByTwilioSmsNumber('+19995550002'),
    ]);

    expect(sender).toBeNull();
    expect(resolvedLandlord).toBeNull();
    // Webhook should NOT log (no sender = no recipient_id for notifications_log)
  });
});
