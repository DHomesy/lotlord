/**
 * Twilio SMS integration
 */

const twilio = require('twilio');
const env = require('../config/env');

let client;

function getClient() {
  if (!client) {
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/**
 * Send an SMS message.
 * @param {Object} opts
 * @param {string} opts.to    - Recipient phone number (E.164 format, e.g. +14155551234)
 * @param {string} opts.body  - Message text (max 160 chars for single SMS)
 * @param {string} [opts.from] - Sender number (E.164). Defaults to TWILIO_PHONE_NUMBER (platform number).
 *                               Pass a landlord's provisioned number to send from their personal line.
 * @returns {Promise<string>} Twilio message SID
 */
async function sendSms({ to, body, from }) {
  const message = await getClient().messages.create({
    from: from || env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
  return message.sid;
}

module.exports = { sendSms };
