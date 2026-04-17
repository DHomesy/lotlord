# LotLord — Roadmap

Planned features and improvements. All items here are **not yet implemented** unless noted.
See [CHANGELOG.md](CHANGELOG.md) for what has already shipped.

Items are ordered by strategic priority. Complete Tier 1 before onboarding real users; complete Tier 2 before driving marketing traffic; Tier 3 is required before operating as a multi-landlord SaaS.

---

## Table of Contents

- [Tier 1 — Product Viability](#tier-1--product-viability)
  - [Stripe Subscription Webhook Lifecycle](#stripe-subscription-webhook-lifecycle)
  - [Rent Payment ACH Verification](#rent-payment-ach-verification)
- [Tier 2 — Retention & Trust](#tier-2--retention--trust)
  - [Tenant Payment Receipts & Statements](#tenant-payment-receipts--statements)
  - [Lease PDF Generation](#lease-pdf-generation)
  - [Maintenance Status Notifications](#maintenance-status-notifications)
- [Tier 3 — SaaS Readiness](#tier-3--saas-readiness)
  - [SaaS Multi-Tenancy](#saas-multi-tenancy)
  - [AI Agent for Communications](#ai-agent-for-communications)
  - [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
  - [Per-Property Twilio Number Management](#per-property-twilio-number-management)
- [Tier 4 — Developer Health](#tier-4--developer-health)
  - [Test Coverage Audit](#test-coverage-audit)
  - [Per-Record Change Tracking](#per-record-change-tracking)

---

## Tier 1 — Product Viability

These items block safe production deployment. A user-facing bug or a payment gap at this tier means money is lost or accounts break.

---

### Stripe Subscription Webhook Lifecycle

**Problem:** Stripe webhooks for subscription state transitions are not handled. If a card declines, a trial expires, or a subscription is cancelled from the Stripe dashboard, the app's `subscription_status` column is never updated — users keep full access indefinitely after they stop paying.

**Events to handle** (in `src/controllers/billingController.js` / `webhookController.js`):

| Stripe Event | Action |
|---|---|
| `customer.subscription.created` | Set status `active`, store `current_period_end` |
| `customer.subscription.updated` | Sync status + period dates |
| `customer.subscription.deleted` | Set status `cancelled`, restrict access |
| `invoice.payment_succeeded` | Renew `current_period_end` |
| `invoice.payment_failed` | Set status `past_due`, email landlord |
| `customer.subscription.trial_will_end` | Email landlord 3 days before trial ends |

**Access enforcement:**
- Middleware reads `subscription_status` from the DB (or JWT claim) and blocks `past_due` / `cancelled` landlords from write operations

**Files affected:**
- `src/routes/webhooks.js` — register Stripe webhook route
- `src/controllers/billingController.js` — add event handlers
- `src/dal/userRepository.js` — `updateSubscriptionStatus(userId, status, periodEnd)`
- Migration: add `subscription_status` column if not already present

---

### Rent Payment ACH Verification

**Problem:** Stripe ACH (bank transfer) payments require micro-deposit verification before the first charge. The current flow accepts bank account details but does not guide users through the verification step, meaning first-time ACH payments will silently fail.

**Implementation Steps:**

1. **Frontend** — after adding a bank account, show a "verify your bank" card with an input for two micro-deposit amounts
2. **Backend** — `POST /payments/verify-bank` calls `stripe.paymentMethods.verify()` with the amounts
3. **Backend** — gate ACH charges behind `bank_account_verified` status; fall back to card if bank is unverified
4. **UX** — email tenant when micro-deposits are sent (typically 1–2 business days); link them back to the verification page

---

## Tier 2 — Retention & Trust

Complete before driving user acquisition. Without these, landlords and tenants will churn because they can't document what happened.

---

### Tenant Payment Receipts & Statements

**Goal:** Tenants can download a PDF receipt for each payment and a monthly statement of all charges and payments on their lease.

**Backend:**
- `GET /ledger/statement?from=&to=` — returns structured ledger entries for a date range
- `GET /payments/:id/receipt` — returns a PDF receipt for a single payment
- PDF generation via `pdfkit` or `puppeteer` (render an HTML template, export to PDF)

**Frontend:**
- Statement download button on the tenant `My Payments` page
- Receipt download link on each row of the payment history table

**Data already available:** `ledger_entries`, `rent_charges`, `payments` tables have everything needed.

---

### Maintenance Status Notifications

**Problem:** When a landlord updates a maintenance request status (`open → in_progress → resolved`), the tenant receives no notification. Tenants have no visibility into whether their request is being actioned.

**Implementation Steps:**

1. **Backend** — in `maintenanceController.update()`, after saving, call `notificationService.send()` with the new status
2. **Notification content:**
   - `in_progress`: "Your maintenance request '[title]' is being worked on."
   - `resolved`: "Your maintenance request '[title]' has been resolved."
3. **Channel:** SMS (via Twilio) + in-app notification row (already wired)
4. **Tenant opt-out:** respect existing `notification_preferences` opt-in/out before sending

---

## Tier 3 — SaaS Readiness

Required before operating as a multi-landlord SaaS product. Tier 3 items may involve significant schema changes — complete them as a batch before onboarding multiple production landlords.

---

### SaaS Multi-Tenancy

**Goal:** Support multiple independent landlord organisations with full data isolation.

> ⚠️ Retrofitting `organization_id` after real users are onboarded is very painful. Implement this **before** the first production landlord if operating as SaaS.

**Approach:** Add an `organizations` table and an `organization_id` FK to all tenant-data tables.

```sql
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  plan       TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users       ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE properties  ADD COLUMN organization_id UUID REFERENCES organizations(id);
-- Propagate to: units, tenants, leases, rent_charges, documents, maintenance_requests, etc.
```

All repository queries become `WHERE organization_id = $1` in addition to (or instead of) `WHERE owner_id = $1`.

**Access enforcement:** JWT includes `organizationId`; all repository methods accept and filter by it.

---

### AI Agent for Communications

**Goal:** Auto-respond to tenant SMS/emails with AI-generated replies using GPT-4o-mini.

**Architecture:**

```
Inbound SMS   → Twilio webhook → aiAgentService → OpenAI → reply via Twilio
Inbound email → SES webhook   → aiAgentService → OpenAI → reply via SES
All messages stored in ai_messages table for audit.
```

**Guardrails (non-negotiable):**
- AI may answer FAQs, confirm payment status, log maintenance requests, give lease dates
- AI must NOT make payment arrangements, agree to lease changes, or promise anything legally binding
- Escalation trigger words (`"emergency"`, `"lawyer"`, `"eviction"`) → flag for human review, disable AI replies
- Rate limit: max 5 AI replies per tenant per day
- Every AI message is stored in `ai_messages` for liability protection

**Implementation Steps:**

1. **Backend** — `src/services/aiAgentService.js`:
   - `handleInboundMessage({ tenantId, channel, content })` — entry point from webhooks
   - `generateReply({ conversationId, messageHistory })` — OpenAI call with system prompt
   - System prompt includes: lease details, payment status, open maintenance requests

2. **Backend** — wire into existing webhooks:
   - `POST /webhooks/twilio/sms` — after logging, call `aiAgentService.handleInboundMessage`
   - `POST /webhooks/ses` — after `emailInboxService.processInboundEmail`, call AI handler

3. **Frontend** — `GET /ai/conversations` + `GET /ai/conversations/:id/messages` (route stubs exist):
   - List all AI conversations (tenant, channel, status)
   - Message thread view with escalation controls
   - Admin can mark a conversation as `escalated` (disables AI, triggers alert)

**Files to create:**

| File | Purpose |
|---|---|
| `src/services/aiAgentService.js` | Core AI logic — context building, OpenAI call, reply routing |
| `frontend/src/pages/admin/AIConversationsPage.jsx` | Admin view of all AI threads |

**Environment variable required:** `OPENAI_API_KEY`

---

### Role-Based Access Control (RBAC)

**Goal:** Add a `staff` / property manager role with scoped permissions for landlords who employ people to manage units on their behalf.

**Current roles:** `admin` (full), `landlord` (own properties), `tenant` (own lease)

**Proposed `staff` role:**
- Can view all resources under their associated landlord's properties
- Can create/update maintenance requests and notes
- Cannot record payments, void charges, or access billing
- Cannot delete properties, units, or tenants

**Implementation Steps:**

1. **Migration:**
```sql
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'landlord', 'staff', 'tenant'));
ALTER TABLE users ADD COLUMN staff_of_user_id UUID REFERENCES users(id);
```

2. **Backend** — update `authorize()` calls to include `'staff'` where appropriate; add ownership scoping via `staff_of_user_id`
3. **Frontend** — hide destructive actions (delete, void, record payment) for staff users

---

### Per-Property Twilio Number Management

**Goal:** Allow admins to assign different Twilio phone numbers per property so tenants always see the number associated with their building.

**Schema:**
```sql
CREATE TABLE twilio_numbers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID REFERENCES properties(id),  -- nullable = global fallback
  phone_number TEXT UNIQUE NOT NULL,             -- E.164 format: +15551234567
  twilio_sid   TEXT NOT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Routing logic:**
- Outbound SMS: resolve number from `lease → unit → property → twilio_numbers`; fall back to `TWILIO_PHONE_NUMBER` env var
- Inbound SMS: match `To` header to `twilio_numbers.property_id` for scoped AI agent context

**Implementation Steps:**

1. **Backend** — add `purchaseNumber()` and `releaseNumber()` to `src/integrations/twilio.js`
2. **Backend** — update `notificationService.sendSms()` to resolve the number from property context
3. **Frontend** — Admin page `/admin/phone-numbers`: list assigned numbers, purchase new, release old

---

## Tier 4 — Developer Health

Non-blocking but required before the codebase scales past a small team.

---

### Test Coverage Audit

**Goal:** Achieve meaningful test coverage on all critical business paths: authentication, payments, leases, and charges.

**Current state:** Unit tests exist for auth helpers and `toPublicUser()`. No integration tests for payment flows or lease lifecycle.

**Priority test targets:**
1. Payment recording — charge creation, payment application, ledger balance
2. Lease lifecycle — create, activate, expire
3. Charge voiding — cannot void a paid charge
4. Invite flow — token expiry, duplicate handling

**Approach:** Use Jest + Supertest for HTTP-level integration tests against a test database seeded by `globalSetup.js`.

---

### Per-Record Change Tracking

**Goal:** Record `created_by` and `updated_by` on all major tables for full accountability and audit trail completeness.

**Current state:** `rent_charges` and `ledger_entries` have `created_by`. Most tables do not.

**Tables needing `created_by` / `updated_by`:**
- `properties`, `units`, `leases`, `tenants`, `documents`, `maintenance_requests`

**Approach:**
```sql
ALTER TABLE properties ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE properties ADD COLUMN updated_by UUID REFERENCES users(id);
-- Repeat for: units, leases, tenants, documents, maintenance_requests
```

All `create()` and `update()` DAL methods accept and persist `createdBy` / `updatedBy` from `req.user.sub`.

---

*Last updated: May 2025*


---

## AI Agent for Communications

**Goal:** Auto-respond to tenant SMS/emails with AI-generated replies (GPT-4o-mini).

**Architecture:**

```
Inbound SMS  → Twilio webhook → aiAgentService → OpenAI → reply via Twilio
Inbound email → SES webhook   → aiAgentService → OpenAI → reply via SES
All messages stored in ai_messages table for audit.
```

**Guardrails (non-negotiable):**
- AI may answer FAQs, confirm payment status, log maintenance requests, give lease dates
- AI must NOT make payment arrangements, agree to lease changes, or promise anything legally binding
- Escalation trigger words (`"emergency"`, `"lawyer"`, `"eviction"`) → flag for human review, disable AI replies
- Rate limit: max 5 AI replies per tenant per day
- Every AI message is stored in `ai_messages` — liability protection

**Implementation Steps:**

1. **Backend** — `src/services/aiAgentService.js`:
   - `handleInboundMessage({ tenantId, channel, content })` — entry point from webhooks
   - `generateReply({ conversationId, messageHistory })` — OpenAI API call with system prompt
   - System prompt includes: lease details, payment status, open maintenance requests

2. **Backend** — wire into existing webhooks:
   - `POST /webhooks/twilio/sms` — after logging, call `aiAgentService.handleInboundMessage`
   - `POST /webhooks/ses` — after `emailInboxService.processInboundEmail`, call AI handler

3. **Frontend** — `GET /ai/conversations` + `GET /ai/conversations/:id/messages` (route stubs exist):
   - List all AI conversations (tenant, channel, status)
   - Message thread view
   - Admin can mark conversation as `escalated` (disables AI, triggers alert)

**Files to create:**

| File | Purpose |
|---|---|
| `src/services/aiAgentService.js` | Core AI logic — context building, OpenAI call, reply routing |
| `frontend/src/pages/admin/AIConversationsPage.jsx` | Admin view of all AI threads |

**Environment variable required:**
```
OPENAI_API_KEY=sk-...
```

---

## Role-Based Access Control (RBAC)

**Goal:** Add a `staff` / property manager role with scoped permissions. Needed when a landlord employs people to manage units on their behalf.

**Current roles:** `admin` (full), `landlord` (own properties), `tenant` (own lease)

**Proposed `staff` role:**
- Can view all resources under their associated landlord's properties
- Can create/update maintenance requests and notes
- Cannot record payments, void charges, or access billing
- Cannot delete properties, units, or tenants

**Approach (simple — recommended first):**
```sql
-- Update CHECK constraint
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'landlord', 'staff', 'tenant'));
```

Also requires a `staff_of_user_id UUID REFERENCES users(id)` column on users so staff can be scoped to a specific landlord's data.

**Implementation Steps:**

1. **Migration** — add `'staff'` to role CHECK; add `staff_of_user_id` FK
2. **Backend** — update `authorize()` calls to include `'staff'` where appropriate; add ownership scoping
3. **Frontend** — hide destructive actions (delete, void, payments) for staff users

---

## Per-Record Change Tracking

**Goal:** Record `created_by` and `updated_by` on all major tables for full accountability.

**Current state:** `rent_charges` and `ledger_entries` have `created_by`. Most tables do not.

**Tables needing `created_by` / `updated_by`:**
- `properties`, `units`, `leases`, `tenants`, `documents`, `maintenance_requests`

**Approach:**
```sql
ALTER TABLE properties ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE properties ADD COLUMN updated_by UUID REFERENCES users(id);
-- Repeat for: units, leases, tenants, documents, maintenance_requests
```

All `create()` and `update()` DAL functions accept and persist `createdBy` / `updatedBy` from `req.user.sub`.

---

## Per-Property Twilio Number Management

**Goal:** Allow admins to assign different Twilio phone numbers per property so tenants always see the number associated with their building.

**Schema:**
```sql
CREATE TABLE twilio_numbers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID REFERENCES properties(id),  -- nullable = global fallback
  phone_number TEXT UNIQUE NOT NULL,             -- E.164: +15551234567
  twilio_sid   TEXT NOT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Routing logic:**
- Outbound SMS: resolve number from `lease → unit → property → twilio_numbers`; fall back to `TWILIO_PHONE_NUMBER` env var
- Inbound SMS: match `To` header to `twilio_numbers.property_id` for scoped AI agent context

**Implementation Steps:**

1. **Backend** — `purchaseNumber()` and `releaseNumber()` added to `src/integrations/twilio.js`
2. **Backend** — `notificationService.sendSms` resolves number from property context
3. **Frontend** — Admin page `/admin/phone-numbers`: list, purchase, release

---

## SaaS Multi-Tenancy

**Goal:** Support multiple independent landlord organisations with full data isolation — required before selling as a SaaS product.

> ⚠️ Retrofitting `organization_id` after real users are onboarded is very painful. Implement this **before** first production users if SaaS is planned.

**Approach:** Add an `organizations` table and add `organization_id` FK to all tenant-data tables.

```sql
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  plan       TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users       ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE properties  ADD COLUMN organization_id UUID REFERENCES organizations(id);
-- propagate to: units, tenants, leases, rent_charges, leases, documents, etc.
```

All queries become `WHERE organization_id = $1` instead of `WHERE owner_id = $1`.

---

*Last updated: April 13, 2026*
