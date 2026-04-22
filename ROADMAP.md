# LotLord — Roadmap

Planned features and improvements. Items are **not yet implemented** unless marked ✅ shipped.
See [CHANGELOG.md](CHANGELOG.md) for what has already shipped.

Items are ordered by strategic priority. **Tiers 1 and 2 are complete** — safe to onboard real users and drive marketing traffic. Tier 3 is required before operating as a multi-landlord SaaS.

---

## Table of Contents

- [Tier 1 — Product Viability](#tier-1--product-viability) ✅ Complete
  - [Stripe Subscription Webhook Lifecycle](#stripe-subscription-webhook-lifecycle) ✅
  - [Rent Payment ACH Verification](#rent-payment-ach-verification) ✅
- [Tier 2 — Retention & Trust](#tier-2--retention--trust) ✅ Complete
  - ~~[Tenant Payment Receipts & Statements]~~ ✅ Shipped in v1.6.0
  - [Lease PDF Generation](#lease-pdf-generation)
  - ~~[Maintenance Status Notifications]~~ ✅ Shipped in v1.5.14
- [Tier 3 — SaaS Readiness](#tier-3--saas-readiness)
  - [SaaS Multi-Tenancy](#saas-multi-tenancy)
  - [AI Agent for Communications](#ai-agent-for-communications)
  ~~[Role-Based Access Control (RBAC)]~~ ✅ Shipped in v1.6.0–v1.6.1
  - [Per-Property Twilio Number Management](#per-property-twilio-number-management)
- [Tier 4 — Developer Health](#tier-4--developer-health)
  - [Test Coverage Audit](#test-coverage-audit)
  - [Per-Record Change Tracking](#per-record-change-tracking)

---

## Tier 1 — Product Viability ✅ Complete

All Tier 1 items shipped in **v1.5.14**. Safe to onboard real users.

---

### ✅ Stripe Subscription Webhook Lifecycle — shipped v1.5.14

All subscription lifecycle events are handled in `src/services/stripeService.js` (`handleWebhookEvent`):

| Stripe Event | Action |
|---|---|
| `customer.subscription.created` | Set status `active`, store `current_period_end` |
| `customer.subscription.updated` | Sync status + period dates (single authoritative path) |
| `customer.subscription.deleted` | Set status `cancelled`, restrict access |
| `invoice.payment_failed` | Set status `past_due`, email landlord |
| `customer.subscription.trial_will_end` | Email landlord 3 days before trial ends |

Access enforcement via `requiresStarter` / `requiresEnterprise` middleware blocks `past_due` and `cancelled` landlords from all write operations.

---

### ✅ Rent Payment ACH Verification — shipped v1.5.14

Full micro-deposit verification flow implemented. `listPaymentMethods` returns `verified` status and `hostedVerificationUrl` per payment method. Unverified bank accounts are surfaced in the UI with a direct link to Stripe-hosted verification. ACH charges against unverified accounts return `422 BANK_NOT_VERIFIED`.

---

## Tier 2 — Retention & Trust ✅ Complete

All Tier 2 items shipped in **v1.6.0**.

---

### ✅ Tenant Payment Receipts & Statements — shipped v1.6.0

- `GET /payments/:id/receipt` — PDF receipt per payment (landlord, tenant, employees scoped)
- `GET /ledger/statement` — JSON ledger entries for a date range
- `GET /ledger/statement/pdf` — formatted PDF account statement for audit/legal use
- Receipt download icon per row on the tenant Payments page
- "Download Statement (PDF)" button on the tenant Payments page

---

### ✅ Maintenance Status Notifications — shipped v1.5.14

Email + SMS notifications fire on `maintenance_submitted` (to owner), `maintenance_in_progress`, and `maintenance_completed` (to submitter). All notifications are fire-and-forget and respect `notification_preferences` opt-in/out.

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

### ✅ Role-Based Access Control (RBAC) — shipped v1.6.0

`employee` role added. Employees are scoped to their employer's properties and units. All `owner_id` resolution runs through `resolveOwnerId()` which transparently redirects employee requests to their employer. Employees cannot record payments, void charges, or manage billing. Landlords invite employees via `POST /invitations/employee`.

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

**Current state:** Integration tests exist across 14 suites (192 total). Coverage includes auth flows (login, refresh, logout invalidation, password reset single-use), notification scoping (IDOR guards for conversations/log/sendMessage), middleware (plan limits, resolveOwnerId), and core CRUD. Payment flows and lease lifecycle are not yet covered by integration tests.

**Remaining priority test targets:**
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

*Last updated: April 2026*
