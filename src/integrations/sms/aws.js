/**
 * AWS SMS integration (End User Messaging SMS via Pinpoint SMS Voice V2 API)
 */

const {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} = require('@aws-sdk/client-pinpoint-sms-voice-v2');
const env = require('../../config/env');

let client;

function getClient() {
  if (!client) {
    client = new PinpointSMSVoiceV2Client({ region: env.AWS_REGION || 'us-east-1' });
  }
  return client;
}

/**
 * Send an SMS message through AWS End User Messaging SMS.
 *
 * @param {Object} opts
 * @param {string} opts.to       Recipient E.164 phone number
 * @param {string} opts.body     Message body
 * @param {string} [opts.from]   Optional origination identity override (phone number, sender ID, pool ARN)
 * @returns {Promise<string>}    AWS message id
 */
async function sendSms({ to, body, from }) {
  const input = {
    DestinationPhoneNumber: to,
    MessageBody: body,
    MessageType: env.AWS_SMS_MESSAGE_TYPE || 'TRANSACTIONAL',
  };

  const originationIdentity = from || env.AWS_SMS_ORIGINATION_IDENTITY;
  if (originationIdentity) {
    input.OriginationIdentity = originationIdentity;
  }
  if (env.AWS_SMS_CONFIGURATION_SET_NAME) {
    input.ConfigurationSetName = env.AWS_SMS_CONFIGURATION_SET_NAME;
  }

  const result = await getClient().send(new SendTextMessageCommand(input));
  return result.MessageId || result.$metadata?.requestId || '';
}

module.exports = { sendSms };
