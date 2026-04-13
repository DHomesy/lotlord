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
 * @param {string} opts.to   - Recipient phone number (E.164 format, e.g. +14155551234)
 * @param {string} opts.body - Message text (max 160 chars for single SMS)
 * @returns {Promise<string>} Twilio message SID
 */
async function sendSms({ to, body }) {
  const message = await getClient().messages.create({
    from: env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
  return message.sid;
}

module.exports = { sendSms };
