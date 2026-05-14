/**
 * Unit tests for src/services/twilioService.js
 *
 * All Twilio API calls and DB access are mocked — no network or DB needed.
 * Run: npm run test:unit
 */

jest.mock('../../src/dal/userRepository');
jest.mock('../../src/config/env', () => ({
  TWILIO_ACCOUNT_SID:  'ACtest',
  TWILIO_AUTH_TOKEN:   'authtest',
  APP_BASE_URL:        'https://app.lotlord.test',
}));

const userRepo      = require('../../src/dal/userRepository');
const twilioService = require('../../src/services/twilioService');

// ── Shared mock Twilio client factory ─────────────────────────────────────────

function makeMockClient({
  availableNumbers = [{ phoneNumber: '+15125550001' }],
  purchasedSid     = 'PNtest123',
  serviceSid       = 'MGtest456',
} = {}) {
  return {
    availablePhoneNumbers: jest.fn().mockReturnValue({
      local: {
        list: jest.fn().mockResolvedValue(availableNumbers),
      },
    }),
    incomingPhoneNumbers: Object.assign(
      jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({}),
      }),
      {
        create: jest.fn().mockResolvedValue({ sid: purchasedSid, phoneNumber: '+15125550001' }),
      },
    ),
    messaging: {
      v1: {
        services: Object.assign(
          jest.fn().mockReturnValue({
            phoneNumbers: {
              create: jest.fn().mockResolvedValue({}),
            },
            remove: jest.fn().mockResolvedValue({}),
          }),
          {
            create: jest.fn().mockResolvedValue({ sid: serviceSid }),
          },
        ),
      },
    },
  };
}

// ── provisionSmsNumber ────────────────────────────────────────────────────────

describe('provisionSmsNumber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('provisions a number and saves it to the DB', async () => {
    const mockClient = makeMockClient();
    twilioService._setClientForTesting(mockClient);

    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord', twilio_sms_number: null,
    });
    userRepo.updateTwilioProvisioning.mockResolvedValue({});

    const result = await twilioService.provisionSmsNumber('landlord-uuid', '512');

    expect(result.phoneNumber).toBe('+15125550001');
    expect(result.messagingServiceSid).toBe('MGtest456');
    expect(userRepo.updateTwilioProvisioning).toHaveBeenCalledWith('landlord-uuid', {
      twilioSmsNumber:           '+15125550001',
      twilioMessagingServiceSid: 'MGtest456',
    });
  });

  it('throws 409 if landlord already has a number', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord', twilio_sms_number: '+15125550001',
    });

    await expect(twilioService.provisionSmsNumber('landlord-uuid', '512'))
      .rejects.toMatchObject({ status: 409, code: 'ALREADY_PROVISIONED' });
  });

  it('throws 403 for non-landlord users', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'tenant-uuid', role: 'tenant', twilio_sms_number: null,
    });

    await expect(twilioService.provisionSmsNumber('tenant-uuid', '512'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('throws 404 if landlord not found', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(twilioService.provisionSmsNumber('missing-uuid', '512'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 422 with NO_NUMBERS_IN_AREA_CODE when no numbers available', async () => {
    const mockClient = makeMockClient({ availableNumbers: [] });
    twilioService._setClientForTesting(mockClient);

    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord', twilio_sms_number: null,
    });

    await expect(twilioService.provisionSmsNumber('landlord-uuid', '999'))
      .rejects.toMatchObject({ status: 422, code: 'NO_NUMBERS_IN_AREA_CODE' });
  });

  it('releases the purchased number if Messaging Service creation fails', async () => {
    const mockClient = makeMockClient();
    // Make service creation throw after the number is purchased
    mockClient.messaging.v1.services.create.mockRejectedValue(new Error('Twilio error'));
    twilioService._setClientForTesting(mockClient);

    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord', twilio_sms_number: null,
    });

    await expect(twilioService.provisionSmsNumber('landlord-uuid', '512'))
      .rejects.toThrow('Twilio error');

    // The purchased number should have been released via remove()
    expect(mockClient.incomingPhoneNumbers('PNtest123').remove).toHaveBeenCalled();
  });

  it('configures the Messaging Service inbound webhook URL correctly', async () => {
    const mockClient = makeMockClient();
    twilioService._setClientForTesting(mockClient);

    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord', twilio_sms_number: null,
    });
    userRepo.updateTwilioProvisioning.mockResolvedValue({});

    await twilioService.provisionSmsNumber('landlord-uuid', '512');

    expect(mockClient.messaging.v1.services.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundRequestUrl: 'https://app.lotlord.test/api/v1/webhooks/twilio/sms',
        inboundMethod:     'POST',
      }),
    );
  });
});

// ── deprovisionSmsNumber ──────────────────────────────────────────────────────

describe('deprovisionSmsNumber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes the Messaging Service and clears DB columns', async () => {
    const mockClient = makeMockClient();
    twilioService._setClientForTesting(mockClient);

    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid',
      role: 'landlord',
      twilio_sms_number:            '+15125550001',
      twilio_messaging_service_sid: 'MGtest456',
    });
    userRepo.updateTwilioProvisioning.mockResolvedValue({});

    await twilioService.deprovisionSmsNumber('landlord-uuid');

    expect(mockClient.messaging.v1.services('MGtest456').remove).toHaveBeenCalled();
    expect(userRepo.updateTwilioProvisioning).toHaveBeenCalledWith('landlord-uuid', {
      twilioSmsNumber:           null,
      twilioMessagingServiceSid: null,
    });
  });

  it('throws 404 if landlord has no provisioned number', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid', role: 'landlord',
      twilio_sms_number: null, twilio_messaging_service_sid: null,
    });

    await expect(twilioService.deprovisionSmsNumber('landlord-uuid'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 if landlord not found', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(twilioService.deprovisionSmsNumber('missing-uuid'))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── getProvisioningStatus ─────────────────────────────────────────────────────

describe('getProvisioningStatus', () => {
  it('returns provisioned=true with details when number is set', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid',
      twilio_sms_number:            '+15125550001',
      twilio_messaging_service_sid: 'MGtest456',
    });

    const status = await twilioService.getProvisioningStatus('landlord-uuid');

    expect(status).toEqual({
      provisioned:         true,
      phoneNumber:         '+15125550001',
      messagingServiceSid: 'MGtest456',
    });
  });

  it('returns provisioned=false when no number is set', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'landlord-uuid',
      twilio_sms_number: null,
      twilio_messaging_service_sid: null,
    });

    const status = await twilioService.getProvisioningStatus('landlord-uuid');

    expect(status).toEqual({
      provisioned:         false,
      phoneNumber:         null,
      messagingServiceSid: null,
    });
  });

  it('throws 404 if landlord not found', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(twilioService.getProvisioningStatus('missing-uuid'))
      .rejects.toMatchObject({ status: 404 });
  });
});
