# Upgrade Notes: Legacy Plan + Twilio Removal

This release removes legacy subscription plan compatibility and Twilio compatibility paths.

## Breaking Changes

1. Subscription plan aliases removed.
- Removed accepted legacy plan names: `starter`, `enterprise`, `commercial`.
- Only supported paid plan names are `autopilot` and `portfolio`.

2. Stripe checkout plan input is strict.
- `POST /api/v1/billing/checkout` now accepts only `autopilot` or `portfolio`.

3. Stripe webhook nickname parsing is strict.
- Subscription plan is only resolved from Stripe price nicknames `autopilot` and `portfolio`.
- Any other nickname will not map to a plan.

4. Twilio support removed.
- Removed Twilio inbound webhook endpoint: `POST /api/v1/webhooks/twilio/sms`.
- Removed Twilio runtime integrations and Twilio provisioning service.
- AWS End User Messaging SMS is now the only supported SMS provider.

5. Twilio package removed.
- `twilio` dependency has been removed from backend dependencies.

## Infrastructure / Env Changes

### Remove these env vars
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `SMS_PROVIDER`
- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_ENTERPRISE`
- `STRIPE_PRICE_ID_COMMERCIAL`
- `SMS_CAP_STARTER`
- `SMS_CAP_ENTERPRISE`
- `SMS_CAP_COMMERCIAL`

### Keep/set these env vars
- `STRIPE_PRICE_ID_AUTOPILOT`
- `STRIPE_PRICE_ID_PORTFOLIO`
- `AWS_SMS_ORIGINATION_IDENTITY`
- `AWS_SMS_MESSAGE_TYPE`
- `AWS_SMS_CONFIGURATION_SET_NAME` (optional)
- `AWS_SMS_NUMBER_TYPE`
- `AWS_SMS_WEBHOOK_SECRET`
- `SMS_CAP_AUTOPILOT`
- `SMS_CAP_PORTFOLIO`
- `SMS_HELP_RESPONSE` (optional)
- `SMS_STOP_CONFIRMATION` (optional)
- `SMS_START_CONFIRMATION` (optional)
- `SMS_SEND_MAX_ATTEMPTS`
- `SMS_AI_WARN_SEGMENTS`
- `SMS_AI_BLOCK_SEGMENTS`

## Deployment Checklist

1. Update Stripe price nicknames to exactly `autopilot` and `portfolio`.
2. Ensure all landlord `users.subscription_plan` values are migrated to canonical values:
- `starter` -> `NULL` or `autopilot` (business decision)
- `enterprise` -> `autopilot`
- `commercial` -> `portfolio`
3. Remove Twilio webhook configuration from your provider dashboard.
4. Ensure AWS SMS webhook sender uses `POST /api/v1/webhooks/aws/sms` with `x-webhook-secret`.
5. Remove Twilio secrets from deployment environments.
