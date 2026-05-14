/**
 * Twilio Provisioning Service
 * ---------------------------
 * Manages per-landlord SMS numbers using Twilio Messaging Services.
 *
 * Each landlord gets one dedicated phone number wrapped in a Twilio Messaging
 * Service. The Messaging Service is the unit of routing — its inbound webhook
 * always points at our single /api/v1/webhooks/twilio/sms endpoint regardless
 * of how many landlords are provisioned.
 *
 * Flow:
 *   1. Search available US local numbers by area code
 *   2. Purchase the first available number
 *   3. Create a Messaging Service for the landlord
 *   4. Add the purchased number to the Messaging Service
 *   5. Configure the Messaging Service inbound webhook URL
 *   6. Persist phone number + service SID to the users row
 *
 * Teardown reverses steps 3-6 (deleting the Messaging Service releases the number).
 */

const twilio = require('twilio');
const env    = require('../config/env');
const userRepo = require('../dal/userRepository');

// ── Twilio client ─────────────────────────────────────────────────────────────

let _client;
function getClient() {
  if (!_client) {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw Object.assign(
        new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'),
        { status: 503, code: 'TWILIO_NOT_CONFIGURED' },
      );
    }
    _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Provision a new US local SMS number for a landlord.
 * Idempotent guard: throws 409 if already provisioned.
 *
 * @param {string} landlordId  UUID from users.id
 * @param {string} areaCode    3-digit US area code (e.g. '512')
 * @returns {{ phoneNumber: string, messagingServiceSid: string }}
 */
async function provisionSmsNumber(landlordId, areaCode) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });
  if (user.role !== 'landlord') {
    throw Object.assign(new Error('Only landlords can provision SMS numbers'), { status: 403 });
  }
  if (user.twilio_sms_number) {
    throw Object.assign(
      new Error('A number is already provisioned. Release it first before assigning a new one.'),
      { status: 409, code: 'ALREADY_PROVISIONED' },
    );
  }

  const client = getClient();

  // 1. Find an available local number in the requested area code
  const available = await client
    .availablePhoneNumbers('US')
    .local.list({ areaCode, limit: 1 });

  if (!available.length) {
    throw Object.assign(
      new Error(`No available numbers in area code ${areaCode}. Please try a nearby code.`),
      { status: 422, code: 'NO_NUMBERS_IN_AREA_CODE' },
    );
  }

  const phoneNumber = available[0].phoneNumber;

  // 2. Purchase the number
  const purchasedNumber = await client.incomingPhoneNumbers.create({ phoneNumber });

  let messagingServiceSid;
  try {
    // 3. Create a Messaging Service for this landlord
    const service = await client.messaging.v1.services.create({
      friendlyName:    `LotLord-${landlordId}`,
      inboundRequestUrl: `${env.APP_BASE_URL}/api/v1/webhooks/twilio/sms`,
      inboundMethod:   'POST',
    });
    messagingServiceSid = service.sid;

    // 4. Add the purchased number to the Messaging Service
    await client.messaging.v1.services(messagingServiceSid).phoneNumbers.create({
      phoneNumberSid: purchasedNumber.sid,
    });
  } catch (err) {
    // If anything after the purchase fails, release the number so we don't orphan it
    await client.incomingPhoneNumbers(purchasedNumber.sid).remove().catch((releaseErr) => {
      console.error(`[twilioService] Failed to release orphaned number ${phoneNumber}:`, releaseErr.message);
    });
    throw err;
  }

  // 5. Persist to DB
  await userRepo.updateTwilioProvisioning(landlordId, {
    twilioSmsNumber:           phoneNumber,
    twilioMessagingServiceSid: messagingServiceSid,
  });

  return { phoneNumber, messagingServiceSid };
}

/**
 * Release a landlord's provisioned SMS number.
 * Deleting the Messaging Service automatically releases the phone number back to Twilio.
 *
 * @param {string} landlordId
 */
async function deprovisionSmsNumber(landlordId) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });
  if (!user.twilio_sms_number || !user.twilio_messaging_service_sid) {
    throw Object.assign(new Error('No provisioned number found for this landlord'), { status: 404 });
  }

  const client = getClient();

  // Deleting the Messaging Service releases the number automatically.
  // Guard against a Twilio 404 — could happen if the service was already deleted
  // out-of-band (e.g. concurrent request or manual cleanup in Twilio dashboard).
  try {
    await client.messaging.v1.services(user.twilio_messaging_service_sid).remove();
  } catch (err) {
    const isAlreadyGone = err?.status === 404 || err?.code === 20404;
    if (!isAlreadyGone) throw err;
    console.warn(`[twilioService] Messaging Service ${user.twilio_messaging_service_sid} already gone — clearing DB record`);
  }

  await userRepo.updateTwilioProvisioning(landlordId, {
    twilioSmsNumber:           null,
    twilioMessagingServiceSid: null,
  });
}

/**
 * Return the current provisioning state for a landlord.
 *
 * @param {string} landlordId
 * @returns {{ provisioned: boolean, phoneNumber: string|null, messagingServiceSid: string|null }}
 */
async function getProvisioningStatus(landlordId) {
  const user = await userRepo.findById(landlordId);
  if (!user) throw Object.assign(new Error('Landlord not found'), { status: 404 });

  return {
    provisioned:          !!user.twilio_sms_number,
    phoneNumber:          user.twilio_sms_number          || null,
    messagingServiceSid:  user.twilio_messaging_service_sid || null,
  };
}

// Exported for testing — allows injecting a mock client in unit tests
function _setClientForTesting(mockClient) {
  _client = mockClient;
}

module.exports = {
  provisionSmsNumber,
  deprovisionSmsNumber,
  getProvisioningStatus,
  _setClientForTesting,
};
