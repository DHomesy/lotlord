/**
 * Unit tests for outbound SMS routing.
 * AWS SMS is the only provider.
 */

jest.mock('../../src/config/env', () => ({
  FRONTEND_URL: 'https://app.lotlord.test',
  SMS_SEND_MAX_ATTEMPTS: '1',
}));

jest.mock('../../src/integrations/sms', () => ({
  sendSms: jest.fn().mockResolvedValue('aws-msg-id-123'),
}));

jest.mock('../../src/dal/notificationRepository');
jest.mock('../../src/dal/userRepository');
jest.mock('../../src/dal/tenantRepository');
jest.mock('../../src/dal/smsRepository');
jest.mock('../../src/integrations/email');

const smsIntegration   = require('../../src/integrations/sms');
const notificationRepo = require('../../src/dal/notificationRepository');
const userRepo         = require('../../src/dal/userRepository');
const tenantRepo       = require('../../src/dal/tenantRepository');
const smsRepo          = require('../../src/dal/smsRepository');
const notificationService = require('../../src/services/notificationService');

const TENANT_PHONE = '+14155550002';
const LANDLORD_IDENTITY = 'pn-owner-identity-id';

const landlord = {
  id: 'landlord-uuid',
  role: 'landlord',
  aws_sms_phone_number_id: LANDLORD_IDENTITY,
  aws_sms_phone_number: '+15125550001',
};
const tenant = { id: 'tenant-uuid', role: 'tenant', phone: TENANT_PHONE, email: 'tenant@test.com' };

const smsTemplate = {
  id: 'tpl-uuid',
  channel: 'sms',
  trigger_event: 'rent_due',
  body_template: 'Your rent is due.',
  subject: null,
};

describe('AWS outbound SMS routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    notificationRepo.findTemplateByEvent.mockResolvedValue(smsTemplate);
    notificationRepo.findTemplateById.mockResolvedValue(smsTemplate);
    notificationRepo.createLogEntry.mockResolvedValue({ id: 'log-uuid' });
    notificationRepo.updateLogEntry.mockResolvedValue(undefined);
    notificationRepo.findLogById.mockResolvedValue({ id: 'log-uuid', status: 'sent' });
    tenantRepo.findByUserId.mockResolvedValue({ id: 'tenant-record-uuid' });
    smsRepo.getTenantOwnerPreference.mockResolvedValue(null);
    smsRepo.incrementMonthlyUsage.mockResolvedValue({});

    userRepo.findById.mockImplementation((id) => {
      if (id === 'landlord-uuid') return Promise.resolve(landlord);
      return Promise.resolve(tenant);
    });
  });

  it('uses landlord AWS origination identity when landlordId is supplied', async () => {
    await notificationService.sendByTriggerEvent({
      triggerEvent: 'rent_due',
      recipientId: 'tenant-uuid',
      channel: 'sms',
      landlordId: 'landlord-uuid',
    });

    expect(smsIntegration.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ from: LANDLORD_IDENTITY, to: TENANT_PHONE }),
    );
  });

  it('sends without owner override when landlordId is omitted', async () => {
    await notificationService.sendByTriggerEvent({
      triggerEvent: 'rent_due',
      recipientId: 'tenant-uuid',
      channel: 'sms',
    });

    expect(smsIntegration.sendSms).toHaveBeenCalledWith(
      expect.not.objectContaining({ from: expect.any(String) }),
    );
  });

  it('sendSmsAdhoc uses landlord identity when provided', async () => {
    await notificationService.sendSmsAdhoc({
      recipientId: 'tenant-uuid',
      body: 'Your payment is due.',
      landlordId: 'landlord-uuid',
    });

    expect(smsIntegration.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ from: LANDLORD_IDENTITY, to: TENANT_PHONE }),
    );
  });
});
