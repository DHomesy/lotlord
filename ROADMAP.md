# LotLord — Roadmap

Planned features and improvements. All items here are **not yet implemented**.
See [CHANGELOG.md](CHANGELOG.md) for what has already shipped.

---

## Table of Contents

- [AI Agent for Communications](#ai-agent-for-communications)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Per-Record Change Tracking](#per-record-change-tracking)
- [Per-Property Twilio Number Management](#per-property-twilio-number-management)
- [SaaS Multi-Tenancy](#saas-multi-tenancy)

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
