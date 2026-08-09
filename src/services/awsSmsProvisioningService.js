const {
  PinpointSMSVoiceV2Client,
  RequestPhoneNumberCommand,
  ReleasePhoneNumberCommand,
  DescribePhoneNumbersCommand,
  PutKeywordCommand,
} = require('@aws-sdk/client-pinpoint-sms-voice-v2');
const env = require('../config/env');
const userRepo = require('../dal/userRepository');

let client;
function getClient() {
  if (!client) {
    client = new PinpointSMSVoiceV2Client({ region: env.AWS_REGION || 'us-east-1' });
  }
  return client;
}

async function putComplianceKeywords(originationIdentity) {
  const keywords = [
    {
      keyword: 'STOP',
      action: 'OPT_OUT',
      message: env.SMS_STOP_CONFIRMATION || 'You are unsubscribed from SMS for this property manager. Reply START to re-subscribe.',
    },
    {
      keyword: 'START',
      action: 'OPT_IN',
      message: env.SMS_START_CONFIRMATION || 'You are re-subscribed to transactional SMS for this property manager. Reply STOP anytime to opt out.',
    },
    {
      keyword: 'HELP',
      action: 'AUTOMATIC_RESPONSE',
      message: env.SMS_HELP_RESPONSE || 'LotLord support: transactional rental updates. Reply STOP to opt out for this property manager.',
    },
  ];

  for (const k of keywords) {
    await getClient().send(new PutKeywordCommand({
      OriginationIdentity: originationIdentity,
      Keyword: k.keyword,
      KeywordAction: k.action,
      KeywordMessage: k.message,
    }));
  }
}

async function provisionSmsNumber(landlordId) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });
  if (user.role !== 'landlord') throw Object.assign(new Error('Only landlords can provision SMS numbers'), { status: 403 });
  if (user.aws_sms_phone_number || user.aws_sms_phone_number_id) {
    throw Object.assign(new Error('A number is already provisioned. Release it first before assigning a new one.'), {
      status: 409,
      code: 'ALREADY_PROVISIONED',
    });
  }

  const result = await getClient().send(new RequestPhoneNumberCommand({
    IsoCountryCode: 'US',
    MessageType: 'TRANSACTIONAL',
    NumberCapabilities: ['SMS'],
    NumberType: (env.AWS_SMS_NUMBER_TYPE || 'TOLL_FREE'),
    DeletionProtectionEnabled: false,
    ...(env.AWS_SMS_TWO_WAY_CHANNEL_ARN && env.AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN
      ? {
          TwoWayEnabled: true,
          TwoWayChannelArn: env.AWS_SMS_TWO_WAY_CHANNEL_ARN,
          TwoWayChannelRole: env.AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN,
        }
      : {}),
    ClientToken: `${landlordId}-${Date.now()}`,
  }));

  if (!result?.PhoneNumberId || !result?.PhoneNumber) {
    throw Object.assign(new Error('AWS did not return a phone number identity.'), { status: 502 });
  }

  try {
    await putComplianceKeywords(result.PhoneNumberId);
  } catch (err) {
    console.warn('[awsSmsProvisioning] Keyword setup failed (non-fatal):', err.message);
  }

  await userRepo.updateAwsSmsProvisioning(landlordId, {
    awsSmsPhoneNumber: result.PhoneNumber,
    awsSmsPhoneNumberId: result.PhoneNumberId,
  });

  return {
    phoneNumber: result.PhoneNumber,
    phoneNumberId: result.PhoneNumberId,
    status: result.Status || 'PENDING',
  };
}

async function deprovisionSmsNumber(landlordId) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });
  if (!user.aws_sms_phone_number_id) {
    throw Object.assign(new Error('No provisioned number found for this landlord'), { status: 404 });
  }

  await getClient().send(new ReleasePhoneNumberCommand({
    PhoneNumberId: user.aws_sms_phone_number_id,
  }));

  await userRepo.updateAwsSmsProvisioning(landlordId, {
    awsSmsPhoneNumber: null,
    awsSmsPhoneNumberId: null,
  });
}

async function getProvisioningStatus(landlordId) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });

  if (!user.aws_sms_phone_number_id) {
    return { provisioned: false, phoneNumber: null, phoneNumberId: null, status: null };
  }

  let status = null;
  try {
    const desc = await getClient().send(new DescribePhoneNumbersCommand({
      PhoneNumberIds: [user.aws_sms_phone_number_id],
      MaxResults: 1,
    }));
    status = desc?.PhoneNumbers?.[0]?.Status || null;
  } catch (err) {
    console.warn('[awsSmsProvisioning] DescribePhoneNumbers failed:', err.message);
  }

  return {
    provisioned: true,
    phoneNumber: user.aws_sms_phone_number || null,
    phoneNumberId: user.aws_sms_phone_number_id || null,
    status,
  };
}

module.exports = {
  provisionSmsNumber,
  deprovisionSmsNumber,
  getProvisioningStatus,
};
