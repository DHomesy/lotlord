const env = require('../config/env');

module.exports = String(env.SMS_PROVIDER || 'twilio').toLowerCase() === 'aws'
  ? require('./awsSmsProvisioningService')
  : require('./twilioService');
