/**
 * SMS integration entry point.
 *
 * Set SMS_PROVIDER=aws to use AWS End User Messaging SMS.
 * Any other value (or unset) falls back to Twilio during migration.
 */

const env = require('../../config/env');

let impl;
if (String(env.SMS_PROVIDER || 'twilio').toLowerCase() === 'aws') {
  impl = require('./aws');
} else {
  impl = require('../twilio');
}

module.exports = impl;
