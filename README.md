# LotLord

A full-stack property management platform built for landlords to manage tenants, units, leases, maintenance, documents, payments, and communications.

**Version:** 1.5.14 — see [CHANGELOG.md](CHANGELOG.md) for release history.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Architecture Pattern](#architecture-pattern)
- [Tech Stack](#tech-stack)
  - [Current (MVP)](#current-mvp)
  - [Future / Scaled](#future--scaled)
- [System Diagram](#system-diagram)
- [Database Schema](#database-schema)
  - [Identity & Access](#identity--access)
  - [Property & Unit Management](#property--unit-management)
  - [Tenant & Lease Management](#tenant--lease-management)
  - [Financial Ledger](#financial-ledger)
  - [Maintenance](#maintenance)
  - [Documents](#documents)
  - [Notifications](#notifications)
  - [AI Agent](#ai-agent)
- [API Design](#api-design)
- [Key Constraints & Compliance](#key-constraints--compliance)
- [Financial Model — Three Tables Explained](#financial-model--three-tables-explained)
- [Build History](#build-history)
- [Frontend Architecture](#frontend-architecture)
- [SES Email Setup](#ses-email-setup)
- [Cost Awareness](#cost-awareness)
- [Environment Variables](#environment-variables)
- [Changelog](CHANGELOG.md)

---

## Getting Started

### Prerequisites
- **Node.js v22+** — check with `node -v` ([download](https://nodejs.org/)). v24 is fine.
- **PostgreSQL** — provided automatically by Railway; locally use [Postgres.app](https://postgresapp.com/) or Docker
- A `.env` file copied from `.env.example` with at minimum `DATABASE_URL` and `JWT_SECRET` filled in

### Local Setup

```bash
# 1. Clone and install
git clone https://github.com/DHomesy/lotlord
cd lotlord
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET

# 3. Run migrations (creates all tables)
npm run migrate:up

# 4. Seed dev data (optional)
npm run seed

# 5. Start the API dev server
npm run dev:api

# 6. Start the React frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

- API starts at `http://localhost:3000` — hit `GET /health` to confirm.
- Frontend starts at `http://localhost:5173` — Vite proxies all `/api/v1/*` calls to Express automatically (no CORS config needed in dev).

### Useful Scripts

| Script | Where | Description |
|---|---|---|
| `npm run dev:api` | root | Start API with nodemon (auto-reload) |
| `npm run dev:web` | root | Start Vite dev server (frontend) |
| `npm run dev` | root | Start both API and frontend concurrently |
| `npm start` | root | Start API without auto-reload (production) |
| `npm run migrate:up` | root | Apply pending database migrations |
| `npm run seed` | root | Wipe and re-seed dev data |
| `npm test` | root | Run Jest tests |
| `npm run dev` | frontend/ | Start Vite dev server only |
| `npm run build` | frontend/ | Production build to `frontend/dist/` |

---

## Architecture Overview

Property Manager is structured as a **three-tier application**:

| Tier | Technology | Responsibility |
|---|---|---|
| **Client** | React.js | Admin & Tenant UI |
| **API Server** | Node.js (Express) | Business logic, REST API |
| **Data / Services** | PostgreSQL + External APIs | Persistence and integrations |

The API server is the single point of contact for the frontend and all integrations. The frontend never communicates directly with the database or external services.

---

## Architecture Pattern

This application follows a **Layered REST API architecture** with selective **event-driven background processing** for async tasks.

### Primary Pattern — Layered REST

```
React (Presentation Layer)
    ↕  HTTP/REST
Node.js Express (Application Layer)
  ├── Routes        → define endpoints
  ├── Controllers   → handle request/response
  ├── Services      → business logic
  ├── Repositories  → database access (SQL queries)
  └── Middleware    → auth, validation, error handling
    ↕  SQL
PostgreSQL (Data Layer)
```

- Every operation is triggered by an explicit HTTP request
- Controllers are thin — they delegate to service classes
- Services own business rules (e.g., late fee calculation, lease status transitions)
- Repositories are the only layer that talks to the database — this makes swapping databases (Railway → Supabase → AWS RDS) easier

### Secondary Pattern — Background Jobs (Event-Driven)

Certain features cannot live in the request/response cycle and require scheduled or queued processing:

```
Scheduler (node-cron)
  ├── Daily 8am:  Check rent due dates → send rent reminders (email + SMS)
  ├── Daily 9am:  Check overdue payments → apply late fees + send alerts
  └── Weekly Mon: Check lease expiration dates → send expiry warnings
```

> **Current implementation:** Cron jobs call `notificationService.sendAllChannels()` directly — no queue. Each send is synchronous via AWS SES (email) or Twilio (SMS). A future outbound SQS queue can be added for rate-pacing at SaaS scale without changing the service interface.

### Data Flow Examples

**Tenant pays rent:**
```
React → POST /api/payments → Controller → PaymentService
  → Stripe ACH charge → on success → LedgerService.appendEntry()
  → notificationService.sendByTriggerEvent('payment_received', tenantId)
  → ses.js → AWS SES → tenant inbox
  → notifications_log INSERT (status='sent')
  → Response: 200 OK
```

**Rent reminder (scheduled):**
```
node-cron (daily 8am) → RentReminderJob
  → Query rent_charges where due_date = tomorrow
  → For each lease → notificationService.sendAllChannels('rent_due', userId)
  → ses.js → AWS SES (email) + Twilio (SMS)
  → notifications_log INSERT
```

**Tenant email to AI agent:**
```
Tenant replies to reply@lotlord.app
  → SES Receipt Rule → S3 (.eml stored)
  → SQS → Lambda (ses-inbound-processor)
  → mailparser → POST /api/webhooks/ses
  → emailInboxService.processInboundEmail()
  → notifications_log INSERT (status='received')
  → [AI agent] generates reply → ses.replyToEmail() with RFC 2822 threading headers
```

---

## Tech Stack

### Current (MVP)

| Purpose | Technology | Notes |
|---|---|---|
| Frontend | **React 19 + Vite 7** | Scaffolded — see `frontend/` |
| UI Components | **Material UI v6** | DataGrid, forms, responsive layout |
| Routing | **React Router v6** | Role-based `<ProtectedRoute>`, lazy-loaded pages |
| Server State | **TanStack Query v5** | Caching, background refetch, auto-invalidation |
| Forms | **React Hook Form + Zod** | Schema-validated, minimal re-renders |
| Client State | **Zustand** | Auth token + user only |
| HTTP | **Axios** | Interceptors for token inject + silent 401 refresh |
| API Server | Node.js + Express | REST API |
| Database | PostgreSQL on Railway | Simple managed hosting |
| Auth | **JWT (implemented)** | Access token in memory (15 min) + httpOnly refresh cookie (30 days) |
| Payments | **Stripe** (ACH + Subscriptions + Connect) | ACH rent 0.8% capped $5; SaaS subs via Checkout; landlord payouts via Connect Express |
| Email | **AWS SES** | $0.10/1,000 emails; custom domain `@lotlord.app` |
| SMS | Twilio | ~$0.008/SMS + $1/mo per number |
| Documents | **AWS S3** | Pre-signed URLs; CDK stack in `infra/` provisions bucket |
| Scheduler | node-cron | Runs inside the API server process |
| AI Agent | OpenAI (GPT-4o-mini) | Cost-efficient for SMS/email replies |
| Hosting | Railway | API + DB + Redis on one platform |
| CDK Infra | AWS CDK (JavaScript) | `infra/` — SES domain, S3, SQS, Lambda |

### Future / Scaled

| Purpose | Current | → Future |
|---|---|---|
| Database | Railway PostgreSQL | **Supabase** or **AWS RDS** |
| Email queue | Direct SES (sync) | **SES + SQS outbound queue** (rate pacing for multi-landlord SaaS) |
| Hosting | Railway | **AWS / Render / Fly.io** |
| Auth | JWT (current) | **Clerk** (org support for multi-landlord SaaS) |

> **Migration note:** The service layer is abstracted so swapping infrastructure (e.g. DB host, auth provider) only requires changing the relevant integration — not controllers or business logic. This is intentional.

---

## System Diagram

```
┌─────────────────────────────────────────────┐
│              React.js Frontend               │
│         (Admin UI + Tenant Portal)           │
└───────────────────┬─────────────────────────┘
                    │ HTTPS / REST
┌───────────────────▼─────────────────────────┐
│           Node.js + Express API              │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Routes  │ │ Services │ │  Middleware  │  │
│  └────┬─────┘ └────┬─────┘ └─────────────┘  │
│       └────────────┘                         │
│  ┌──────────────────────────────────────┐    │
│  │     node-cron Scheduled Jobs          │    │
│  │  rent-reminder | late-fee | lease-exp │    │
│  └──────────────────────────────────────┘    │
└──┬──────────┬───────────┬──────────┬─────────┘
   │          │           │          │
   ▼          ▼           ▼          ▼
PostgreSQL  AWS SES    Twilio      Stripe
(Railway)  (email)    (SMS)       (ACH)

              ┌──────────┐  ┌─────────────────┐
              │  AWS S3  │  │  OpenAI          │
              │(documents│  │  (AI Agent)      │
              │  + infra)│  │  [planned]       │
              └──────────┘  └─────────────────┘

┌─────────────────────────────────────────────┐
│              AWS Infrastructure              │
│  SES → S3 → SQS → Lambda → /webhooks/ses    │
│  (infra/ — CDK JavaScript)                  │
└─────────────────────────────────────────────┘
```

---

## Database Schema

### Naming Conventions
- All table and column names use `snake_case`
- Primary keys are `id` (UUID recommended over serial integer for portability)
- All tables include `created_at` and `updated_at` timestamps
- Soft deletes via `deleted_at` — **never hard-delete records that have financial or legal history**

---

### Identity & Access

```sql
users
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT NOT NULL
  role            TEXT NOT NULL CHECK (role IN ('admin', 'landlord', 'tenant'))
  first_name      TEXT
  last_name       TEXT
  phone           TEXT
  avatar_url      TEXT
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()
  deleted_at      TIMESTAMPTZ  -- soft delete
```

---

### Property & Unit Management

```sql
properties
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  owner_id        UUID REFERENCES users(id)
  name            TEXT NOT NULL
  address_line1   TEXT NOT NULL
  address_line2   TEXT
  city            TEXT NOT NULL
  state           TEXT NOT NULL
  zip             TEXT NOT NULL
  country         TEXT NOT NULL DEFAULT 'US'
  property_type   TEXT CHECK (property_type IN ('single', 'multi', 'commercial'))
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()
  -- property_type notes:
  --   'single'     one unit, auto-created on property creation
  --   'multi'      2–4 units (small multi-family — traditional cap)
  --   'commercial' unlimited units; requires Enterprise or Commercial plan

units
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  property_id     UUID REFERENCES properties(id)
  unit_number     TEXT NOT NULL
  floor           INT
  bedrooms        INT
  bathrooms       NUMERIC(3,1)
  sq_ft           INT
  rent_amount     NUMERIC(10,2) NOT NULL
  deposit_amount  NUMERIC(10,2)
  status          TEXT DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'maintenance'))
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()
```

---

### Tenant & Lease Management

```sql
tenants
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id                   UUID REFERENCES users(id)
  emergency_contact_name    TEXT
  emergency_contact_phone   TEXT
  notes                     TEXT
  email_opt_in              BOOLEAN NOT NULL DEFAULT false  -- migration 015
  sms_opt_in                BOOLEAN NOT NULL DEFAULT false  -- migration 015
  created_at                TIMESTAMPTZ DEFAULT NOW()
  deleted_at                TIMESTAMPTZ  -- soft delete

lease_co_tenants                       -- migration 023
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
  lease_id    UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE
  tenant_id   UUID NOT NULL REFERENCES tenants(id)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE (lease_id, tenant_id)          -- max 5 co-tenants enforced in leaseRepository

leases
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  unit_id         UUID REFERENCES units(id)
  tenant_id       UUID REFERENCES tenants(id)
  start_date      DATE NOT NULL
  end_date        DATE NOT NULL
  monthly_rent    NUMERIC(10,2) NOT NULL
  deposit_amount  NUMERIC(10,2)
  deposit_status  TEXT DEFAULT 'held' CHECK (deposit_status IN ('held', 'returned', 'partial'))
  status          TEXT DEFAULT 'pending' CHECK (status IN ('active', 'expired', 'terminated', 'pending'))
  signed_at       TIMESTAMPTZ
  document_url    TEXT  -- S3 key
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()
```

---

### Financial Ledger

> **Important:** The `ledger_entries` table is the **source of truth** for all financial history. It is append-only — never update or delete rows. This is the audit log that protects you legally.

```sql
rent_charges
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  unit_id         UUID NOT NULL REFERENCES units(id)      -- always set (migration 010)
  lease_id        UUID REFERENCES leases(id)              -- nullable: standalone utility/vacancy charges
  tenant_id       UUID REFERENCES tenants(id)             -- nullable
  property_id     UUID REFERENCES properties(id)          -- nullable: property-wide charges
  due_date        DATE NOT NULL
  amount          NUMERIC(10,2) NOT NULL
  charge_type     TEXT CHECK (charge_type IN ('rent', 'late_fee', 'utility', 'other'))
  description     TEXT
  created_by      UUID REFERENCES users(id)               -- migration 011
  voided_at       TIMESTAMPTZ                             -- migration 017: soft-delete (null = active)
  voided_by       UUID REFERENCES users(id)               -- migration 017: who voided the charge
  created_at      TIMESTAMPTZ DEFAULT NOW()

rent_payments
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid()
  lease_id                  UUID REFERENCES leases(id)
  charge_id                 UUID REFERENCES rent_charges(id)  -- nullable (partial or unlinked payment)
  amount_paid               NUMERIC(10,2) NOT NULL
  payment_date              DATE NOT NULL
  payment_method            TEXT CHECK (payment_method IN ('stripe_ach', 'stripe_card', 'check', 'cash', 'other'))
  stripe_payment_intent_id  TEXT  -- for reconciliation
  status                    TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
  notes                     TEXT
  created_at                TIMESTAMPTZ DEFAULT NOW()

-- Append-only audit ledger
ledger_entries
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  lease_id        UUID REFERENCES leases(id)
  entry_type      TEXT CHECK (entry_type IN ('charge', 'payment', 'credit', 'adjustment'))
  amount          NUMERIC(10,2) NOT NULL  -- positive = charge, negative = payment/credit
  balance_after   NUMERIC(10,2) NOT NULL  -- running balance after this entry
  description     TEXT
  reference_id    UUID  -- points to rent_charges.id or rent_payments.id
  created_by      UUID REFERENCES users(id)
  created_at      TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at, NO deleted_at — this table is immutable
```

---

### Financial Model — Three Tables Explained

These three tables are **not duplicates** — each answers a different accounting question:

| Table | Accounting equivalent | Answers |
|---|---|---|
| `rent_charges` | **Invoice** | What was billed, to which unit, and when is it due? |
| `rent_payments` | **Receipt** | How was it paid — Stripe ACH, check, cash? What's the Stripe PI ID for disputes? |
| `ledger_entries` | **Journal entry** | What is the tenant's running balance right now, and what caused every change? |

**A complete charge → payment cycle creates 4 rows, not 3 copies:**

```
POST /charges  { unitId, leaseId, amount: 1450, dueDate: 2026-03-01 }
  → rent_charges row:       "Unit 4B billed $1,450 — due 2026-03-01"    (the invoice)
  → ledger_entries row:     entry_type='charge',  balance_after = 1450   (balance ↑)

[Stripe webhook: payment_intent.succeeded]
  → rent_payments row:      status='completed', stripe_payment_intent_id  (the receipt)
  → ledger_entries row:     entry_type='payment', balance_after = 0       (balance ↓)
```

**Why you need all three:**
- Scheduled jobs query `rent_charges.due_date` to find what's due tomorrow — `ledger_entries` has no due date
- Stripe dispute resolution needs `rent_payments.stripe_payment_intent_id` — the ledger doesn't store it
- `ledger_entries.balance_after` gives instant current balance without summing all history
- `GET /ledger/portfolio` aggregates `ledger_entries` for the income statement — no need to touch `rent_charges` or `rent_payments`

**Voiding a charge (soft-delete):**
Charges can be voided by an admin or landlord via `POST /charges/:id/void`. Voiding stamps `voided_at`/`voided_by` on the charge row (never deletes it). If the charge was lease-linked, a `credit` ledger entry is automatically appended to reverse the tenant's running balance. Charges with a completed payment cannot be voided.

**Charge status (computed field):**
`GET /charges` returns a `status` field computed at query time: `voided` (voided_at is set), `paid` (completed rent_payment exists), `pending` (a `pending` payment exists — Stripe ACH is processing and awaiting webhook confirmation), or `unpaid`. The `pending` status is surfaced via a `LATERAL` join that prioritises `completed` over `pending` payments so a charge cannot be double-paid.

**Standalone charges (utility, vacancy cleaning fee):**
Charges without a `lease_id` only create a `rent_charges` row — no ledger entry — because there is no tenant balance to update. They are still queryable and collectable via Stripe.

---

### Maintenance

```sql
maintenance_requests
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  unit_id         UUID REFERENCES units(id)
  submitted_by    UUID REFERENCES users(id)
  assigned_to     UUID REFERENCES users(id)  -- nullable (staff/contractor)
  category        TEXT CHECK (category IN ('plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other'))
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'emergency'))
  title           TEXT NOT NULL
  description     TEXT
  status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))
  resolved_at     TIMESTAMPTZ
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()

maintenance_attachments
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  request_id      UUID REFERENCES maintenance_requests(id)
  file_url        TEXT NOT NULL  -- S3 key
  file_name       TEXT
  file_type       TEXT
  uploaded_by     UUID REFERENCES users(id)
  created_at      TIMESTAMPTZ DEFAULT NOW()
```

---

### Documents

```sql
documents
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  owner_id        UUID REFERENCES users(id)
  related_id      UUID   -- polymorphic: lease_id, unit_id, request_id, etc.
  related_type    TEXT   -- 'lease' | 'unit' | 'maintenance_request' | 'tenant'
  file_url        TEXT NOT NULL  -- S3 key
  file_name       TEXT
  file_type       TEXT
  category        TEXT CHECK (category IN ('lease', 'id', 'insurance', 'inspection', 'receipt', 'other'))
  uploaded_by     UUID REFERENCES users(id)
  created_at      TIMESTAMPTZ DEFAULT NOW()
```

---

### Notifications

```sql
notification_templates
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  name            TEXT NOT NULL
  channel         TEXT CHECK (channel IN ('email', 'sms'))
  trigger_event   TEXT CHECK (trigger_event IN (
                    'rent_due', 'rent_overdue', 'late_fee_applied',
                    'lease_expiring', 'maintenance_update',
                    'payment_received', 'custom'
                  ))
  subject         TEXT   -- email only
  body_template   TEXT   -- supports {{tenant_name}}, {{due_date}}, {{amount}}, etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()

notifications_log
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  template_id     UUID REFERENCES notification_templates(id)  -- nullable for ad-hoc
  recipient_id    UUID REFERENCES users(id)
  channel         TEXT CHECK (channel IN ('email', 'sms'))
  status          TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'received'))
                  -- 'received' = inbound message from tenant; all others = outbound
  subject         TEXT
  body            TEXT   -- rendered body (after variable substitution)
  thread_id       UUID   -- groups messages in the same conversation thread (migration 013)
  external_id     TEXT UNIQUE  -- dedup key: SES Message-ID or Twilio SID (migration 013)
  sent_at         TIMESTAMPTZ
  error_message   TEXT
  created_at      TIMESTAMPTZ DEFAULT NOW()
```

---

### AI Agent

```sql
ai_conversations
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  tenant_id       UUID REFERENCES tenants(id)
  channel         TEXT CHECK (channel IN ('sms', 'email'))
  thread_id       TEXT   -- external thread ref (e.g. Twilio conversation SID)
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated'))
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()

ai_messages
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
  conversation_id   UUID REFERENCES ai_conversations(id)
  role              TEXT CHECK (role IN ('user', 'assistant', 'system'))
  content           TEXT NOT NULL
  tokens_used       INT
  model_used        TEXT  -- e.g. 'gpt-4o-mini'
  created_at        TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at — messages are immutable for audit purposes
```

---

### Audit Log

> Added in `migration 020`. Separate from `ledger_entries` (which is financial-only). The audit log captures **who did what** across the full application — auth events, lease changes, payment lifecycle, charge management, and maintenance submissions.

```sql
audit_log
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id         UUID REFERENCES users(id)    -- nullable for system/webhook actions
  action          TEXT NOT NULL                -- e.g. 'user_login', 'lease_created', 'payment_succeeded'
  resource_type   TEXT NOT NULL                -- e.g. 'user', 'lease', 'payment', 'charge'
  resource_id     UUID                         -- ID of the affected record
  metadata        JSONB                        -- flexible payload: amounts, old/new values, charge types, etc.
  ip_address      TEXT
  created_at      TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at, NO deleted_at — this table is append-only

INDEX idx_audit_log_user     ON audit_log(user_id, created_at DESC)
INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id)
INDEX idx_audit_log_time     ON audit_log(created_at DESC)
```

**Events logged:**

| Action | Triggered by |
|---|---|
| `user_registered` | `POST /auth/register` |
| `user_login` | `POST /auth/login` |
| `charge_created` | Admin/landlord creates a rent charge |
| `charge_voided` | Admin/landlord voids a charge |
| `payment_initiated` | Tenant initiates Stripe ACH payment intent |
| `payment_succeeded` | Stripe webhook: `payment_intent.succeeded` |
| `payment_failed` | Stripe webhook: `payment_intent.payment_failed` |
| `payment_manual_created` | Admin records cash/check payment |
| `lease_created` | New lease saved |
| `lease_terminated` / `lease_status_changed` | Lease status updated |
| `maintenance_request_created` | New maintenance request submitted |

---

## API Design

Base URL: `/api/v1`

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh` |
| Users | `GET /users/:id`, `PATCH /users/:id` |
| Properties | `GET /properties`, `POST /properties`, `GET /properties/:id`, `PATCH /properties/:id` |
| Units | `GET /properties/:id/units`, `POST /properties/:id/units`, `PATCH /units/:id` |
| Tenants | `GET /tenants`, `POST /tenants`, `GET /tenants/:id`, `PATCH /tenants/:id` |
| Leases | `GET /leases`, `POST /leases`, `GET /leases/:id`, `PATCH /leases/:id`, `GET /leases/:id/co-tenants`, `POST /leases/:id/co-tenants`, `DELETE /leases/:id/co-tenants/:tenantId` |
| Payments | `GET /payments?leaseId=`, `POST /payments` (manual), `GET /payments/:id`, `POST /payments/stripe/setup-intent`, `POST /payments/stripe/payment-intent` |
| Ledger | `GET /ledger?leaseId=` (audit trail), `GET /ledger/portfolio` (income summary — admin sees all; landlord scoped to own properties) |
| Charges | `GET /charges` (filter by leaseId/unitId/tenantId/propertyId), `POST /charges` (admin or landlord), `GET /charges/:id`, `PATCH /charges/:id` (edit description/due_date/type), `POST /charges/:id/void` (soft-delete; appends ledger credit if lease-linked) |
| Maintenance | `GET /maintenance`, `POST /maintenance`, `GET /maintenance/:id`, `PATCH /maintenance/:id` |
| Maintenance Attachments | `GET /maintenance/:id/attachments`, `POST /maintenance/:id/attachments` (`multipart/form-data`, field: `file`), `DELETE /maintenance/:id/attachments/:attachmentId` |
| Documents | `GET /documents`, `POST /documents`, `DELETE /documents/:id` |
| Notification Templates | `GET /notifications/templates`, `POST /notifications/templates`, `GET /notifications/templates/:id`, `PATCH /notifications/templates/:id`, `DELETE /notifications/templates/:id` |
| Notifications | `POST /notifications/send` (email, ad-hoc or template), `POST /notifications/send-sms` (ad-hoc SMS), `GET /notifications/log`, `GET /notifications/log/:id` |
| Messages | `GET /notifications/messages` (conversation list), `POST /notifications/messages` (send message to tenant), `GET /notifications/messages/:tenantId` (conversation thread) |
| Webhooks | `POST /webhooks/stripe`, `POST /webhooks/twilio/sms`, `POST /webhooks/ses` (inbound email from Lambda), `POST /webhooks/ses/bounce` (SNS bounce/complaint) |
| AI | `GET /ai/conversations`, `GET /ai/conversations/:id/messages` |
| Audit Log | `GET /audit` (admin only; query params: `resourceType`, `action`, `userId`, `resourceId`, `startDate`, `endDate`, `page`, `limit`) |
| Health | `GET /health` → `{ status, version, env }` — unauthenticated; useful for uptime monitoring |

> All protected routes require a Bearer token in the `Authorization` header. Role-based middleware enforces access (admin vs tenant).

---

## Key Constraints & Compliance

### Legal
- **Tenant PII** (if you ever collect SSN): must be encrypted at rest, not just hashed
- **Fair Housing Act**: the AI agent must not make decisions that produce discriminatory outcomes. Keep humans in the loop for lease approvals or denials
- **Late fees**: rules vary by state — make `late_fee_amount` and grace period configurable per-lease, not hardcoded
- **Security deposits**: many states require deposits to be held in a separate account and returned within a specific window — the ledger tracks this

### AI Agent Boundaries (Important)
- The AI agent may: answer FAQs, confirm payment status, log maintenance requests, provide lease dates
- The AI agent must NOT: make payment arrangements, agree to lease modifications, promise anything legally binding
- Every AI message is stored in `ai_messages` — this is your liability protection
- Always provide an escalation path: if the AI marks a conversation as `escalated`, a human must follow up

### Stripe / Payments

The app uses **two completely separate Stripe payment flows** that must never be confused:

#### 1 — SaaS Subscription Billing (Landlord → LotLord platform)
- Landlord pays for their platform tier (Free / Starter $15 / Enterprise $49)
- Handled by: `billingController.js`, `stripeService.createCheckoutSession()`, `stripeService.handleWebhookEvent()` subscription events
- Stripe entity: landlord's **billing** customer (`users.stripe_billing_customer_id`)
- Money destination: **your** Stripe platform account
- Webhook events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
- Subscription state stored in: `users.subscription_status`, `users.subscription_plan`

#### 2 — ACH Rent Collection (Tenant → Landlord directly)
- Tenant pays rent via ACH bank transfer
- Handled by: `paymentController.js`, `stripeService.createPaymentIntent()` with `transfer_data: { destination: landlordConnect.stripe_account_id }`
- Stripe entity: tenant's **customer** (`tenants.stripe_customer_id`) + landlord's **Connect Express** account (`users.stripe_account_id`)
- Money destination: **landlord's connected bank account** — funds never touch your platform account. Your `STRIPE_SECRET_KEY` facilitates the transfer but you only collect the Stripe platform fee (0.8%, capped at $5 per ACH transaction).
- Webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`
- Payment state stored in: `rent_payments` + `ledger_entries`
- **ACH is available on all tiers** (Free, Starter, Enterprise) — the only prerequisite is that the landlord completes Stripe Connect onboarding (`requiresConnectOnboarded` middleware)

#### Rules
- Never store raw card numbers — Stripe handles all cardholder data
- Prefer **Stripe ACH** (`us_bank_account`) for rent (0.8%, capped at $5) over card (2.9% + $0.30)
- All Stripe events come through `/webhooks/stripe` and must update both `rent_payments` and `ledger_entries`
- Stripe price nicknames in the Dashboard **must** be set to `starter`, `enterprise`, or `commercial` exactly — the webhook stores `price.nickname` as `subscription_plan` in the DB

### Soft Deletes
- Add `deleted_at` to: `users`, `tenants`, `leases`, `units`
- All queries must include `WHERE deleted_at IS NULL` unless intentionally auditing
- You cannot hard-delete any record with associated financial history

### Multi-tenancy (Future-Proofing)
- If you ever want to sell this as SaaS to other landlords: add an `organizations` table and scope every query to `organization_id`
- Add this **now** if SaaS is a possibility — retrofitting it is painful

---

## Build History

See **[CHANGELOG.md](CHANGELOG.md)** for the full versioned release history.

---

## Build Order Archive

> Kept for reference. All steps are complete. See CHANGELOG.md for details.

- [x] **1. Project scaffold** — Node.js + Express, folder structure, middleware, route stubs
- [x] **2. DB migrations** — 8 migration files covering all tables; run with `npm run migrate:up`
- [x] **3. Config layer** — `src/config/env.js` (env validation), `src/config/db.js` (pg Pool + helpers)
- [x] **4. Integration stubs** — AWS SES, S3, Twilio, Stripe, OpenAI all stubbed under `src/integrations/`
- [x] **5. Scheduled jobs skeleton** — `src/jobs/index.js` with node-cron placeholders for rent reminders, late fees, lease expiry
- [x] **6. Dev seed** — `seeds/dev_seed.js` — run `npm run seed` to populate test data
- [x] **7. Auth** — `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` (JWT + bcrypt)
- [x] **8. Properties + Units CRUD** — full CRUD with role guards, vacancy checks
- [x] **9. Tenants + Leases CRUD** — lease creation marks unit occupied; termination frees it; deposit auto-ledgered
- [x] **10. Ledger + Manual payment recording** — append-only ledger, cash/check recording, late fee + rent charge generation
- [x] **11. Maintenance requests** — CRUD + attachment upload via AWS S3
- [x] **12. Email notifications** — NotificationService, template rendering, Gmail send
- [x] **13. Scheduled jobs** — wire up cron jobs to real service calls
- [x] **14. Stripe ACH** — SetupIntent (bank account onboarding), PaymentIntent creation, webhook handler with ledger reconciliation, migration 009 for `stripe_customer_id`
- [x] **15. SMS via Twilio** — outbound alerts (`sendSmsAdhoc`, `sendAllChannels` on all cron jobs), inbound webhook with signature verification, `migration 012` adds `received` log status
- [x] **16. React frontend** — Full SPA scaffolded in `frontend/`. React 19 + Vite 7 + MUI v6 + React Router v6 + TanStack Query v5 + Zustand + React Hook Form + Zod + Axios. Login, role-based routing, `<Bootstrap>` silent-refresh gate, all admin pages (properties, tenants, leases, ledger, charges, payments, maintenance, documents, notifications, users), all tenant portal pages (dashboard, payments, maintenance, documents, profile). See [frontend/README.md](frontend/README.md) for architecture detail.
- [x] **Email via AWS SES** — Replaced Gmail OAuth2 with AWS SES on `@lotlord.app`. Outbound: `@aws-sdk/client-ses` `SendEmailCommand` / `SendRawEmailCommand` (in-thread replies). Inbound: SES \u2192 S3 \u2192 SQS \u2192 Lambda parses .eml (`mailparser`) \u2192 `POST /webhooks/ses`; `emailInboxService` deduplicates and logs. Bounce/complaint: SNS \u2192 `POST /webhooks/ses/bounce` \u2192 marks `email_bounced` on users row; `notificationService` guards against sending to bounced addresses. Full AWS infrastructure in `infra/` (CDK JavaScript).
- [x] **17. Tenant portal** — Fully wired tenant portal: `GET /tenants/me` endpoint resolves the logged-in user's tenant record; `useMyLease` hook chains tenant → active lease for all portal pages; Dashboard shows property name, address, unit, rent, dates, deposit, and late fee with a lease-expiry countdown; Payments page auto-resolves `leaseId` (no more 400 errors); Maintenance submission form auto-fills and locks the tenant's unit; `MaintenanceForm` gains a `lockedUnitId` prop; `leaseController.listLeases` auto-scopes to the tenant's own leases (security fix)
- [x] **18. Bug Fixes** — Fixed tenant creation (now accepts user fields and auto-creates user account), fixed $NaN display in payments and leases tables, fixed maintenance form validation errors (unitId and priority), improved maintenance display to show property address + unit number instead of IDs
- [x] **19. Tenant Invitation System** — Crypto-random invite links sent via email + SMS; `tenant_invitations` table (`migration 014`); public `GET /invitations/:token` + `POST /invitations/:token/accept` endpoints; tenant self-signup flow pre-fills name/email/unit from invite; auto-creates `users` + `tenants` rows and returns JWT on acceptance; `AcceptInvitePage` public frontend route; admin `TenantsPage` updated: "New Tenant" → "Invite Tenant", pending invitations table with status chips
- [x] **20. Smart Dropdowns** — Replaced all raw UUID text inputs with searchable MUI Autocomplete pickers; `UnitPicker`, `TenantPicker`, `LeasePicker` components in `frontend/src/components/pickers/`; `unitRepository.findAll` now JOINs properties to expose `property_name` + `property_address`; updated `LeaseForm`, `MaintenanceForm`, `ChargesPage`, `TenantsPage` invite form and `MaintenancePage`
- [x] **21. Mobile Responsiveness** — `AdminShell` logout changed to `LogoutIcon`; `TenantShell` nav replaced with `<Tabs variant="scrollable" scrollButtons="auto">`; `PageContainer` header stacks vertically on mobile with `flexDirection: { xs: 'column', sm: 'row' }`; `DataTable` wrapped in `overflowX: auto` container with `minWidth: 480` so tables scroll rather than squash
- [x] **22. User Registration Flow** — `RegisterPage` now has a Landlord/Tenant `ToggleButtonGroup`; `landlord` normalizes to `admin` role in `authService`; tenant self-registration auto-creates a `tenants` row; `useRegister` hook now auto-logs in and navigates by role (`/dashboard` or `/my/dashboard`) instead of redirecting to `/login`
- [x] **23. Dashboard Analytics** — New `GET /api/v1/analytics/dashboard` endpoint; `analyticsRepository` runs five parallel queries: monthly income (sum of active lease rents), unpaid dues (overdue charges minus payments), occupancy rate (from unit status), last 5 payments, last 5 open maintenance requests; `DashboardPage` redesigned with 4 stat cards (Monthly Income, Unpaid Dues, Occupancy Rate w/ progress bar, Open Maintenance) and two Recent Activity tables
- [x] **24. Unified Messaging (Option B)** — Admin-initiated conversations via existing email + SMS transport; `migration 015` adds `email_opt_in`/`sms_opt_in` to tenants; `AcceptInvitePage` gains explicit opt-in checkboxes (compliance); `invitationService.acceptInvitation()` stores preferences; `notificationRepository` gains `findConversations()` + `findConversationThread()` + `deleteTemplate()`; `notificationService.sendMessage()` gates sends on opt-in; `GET/POST /notifications/messages` + `GET /notifications/messages/:tenantId` routes; `MessagesPage` with split-pane conversation list + thread view + compose form; mobile-responsive (stack navigation on small screens)
- [x] **25. Communication Templates UI** — Full CRUD at `/notifications/templates`; `DELETE /notifications/templates/:id` endpoint; `NotificationTemplatesPage` with DataTable, create/edit dialog, variable picker chips (click to insert at cursor), channel + trigger event selects, delete confirmation
- [x] **26. Lease UX & Unit Status Improvements** — `LeasesPage` gains an Active/Archived toggle (defaults to active+pending; expired+terminated hidden behind a badge-count toggle). `PropertyDetailPage` gains per-row Edit Unit button, vacancy summary chips (vacant / occupied / maintenance counts), and `sq_ft` column. `UnitForm` gets `isEdit` mode: locks unit number, restricts status to `vacant`/`maintenance` only (occupied is system-managed), shows inline info alert when unit is occupied. `leaseService.createLease` guard tightened: now rejects any unit that is not strictly `vacant` (blocks `maintenance` units too). `StatusChip` extended with `maintenance` amber chip. Dev seed fixed: `tenant_invitations` now deleted before `tenants`/`units` to avoid FK violation on `npm run seed`.
- [x] **27. Bug fixes (lease charges & ledger)** — `EditLeasePage` loads existing rent charges before generating new ones; filters out months that already have a charge so no duplicates are created; preview Alert shows "N new, M skipped" counts. `LedgerPage` rewritten: `LeasePicker` required before load, `useLedger` guarded with `enabled: !!leaseId` to prevent spurious 400s, columns corrected to `entry_type` / `balance_after` / `created_by_name`, current-balance chip added with color coding.
- [x] **29. Landlord role + bug fixes** — Replaced `staff` role with first-class `landlord` role throughout: `migration 016` updates DB CHECK constraint (`admin` | `landlord` | `tenant`), `authService` no longer normalizes landlord→admin, all backend routes/services updated (`analytics`, `invitations`, `tenants`, `maintenanceService`), frontend router `allowedRoles` updated. Dev seed expanded to 3 users: `admin@example.com`, `landlord@example.com` (Alice Smith, owns Maple Apartments), `tenant@example.com`. Fixed `PropertyDetailPage` crash (useMemo called after early return — Rules of Hooks violation). Fixed tenant charges page showing nothing (defaulted to Outstanding tab; changed default to All).
- [x] **30. Tenant billing tab** — Extracted bank account (ACH) section from tenant `ProfilePage` into a dedicated `TenantBillingPage` at `/my/billing`. Added "Billing" nav entry (with `AccountBalanceIcon`) to `TenantShell` between Charges and Maintenance, on both the scrollable tab bar (sm+) and the mobile `BottomNavigation`. `ProfilePage` is now purely profile + password change. (Later revised: Billing section folded back into Profile page under a "Billing" heading to avoid nav crowding; `/my/billing` route removed.)
- [x] **31. Admin/Landlord profile page + mobile scroll fix** — New `AdminProfilePage` at `/profile`: edit name/phone, change password, and a Billing section to connect own bank account (ACH receive). Sidebar gains a "Profile" link (visible to all roles). Fixed admin-side mobile horizontal scrolling: `DataTable` desktop grid now wrapped in `overflowX: auto` container so grids scroll within themselves; `AdminShell` main content Box gains `minWidth: 0` + `overflow: hidden` to prevent flex overflow.
- [x] **32. Audit log, tenant photo uploads, billing UX & duplicate payment prevention** —
  - **Audit log** (`migration 020`): new `audit_log` table; `auditRepository` + `auditService` (fire-and-forget wrapper that never crashes the primary request); `GET /api/v1/audit` (admin-only, filterable by resource, action, date range); instrumented in `authController` (login/register), `chargesController` (create/void), `stripeService` (initiated/succeeded/failed), `leaseService` (created/terminated), `maintenanceService` (created), `ledgerService` (manual payment); `AuditLogPage` admin frontend with filterable table + metadata JSON viewer; Sidebar "Audit Log" entry (admin-only).
  - **Tenant maintenance photo uploads**: `uploadAttachment()` added to `frontend/src/api/maintenance.js`; `MaintenanceForm` gains optional `showPhotos` prop (file input, up to 5 files, 20 MB each, `capture="environment"` for mobile rear camera, image/PDF accept); `TenantMaintenancePage` two-step submit: create request → parallel upload each file; partial-failure warning shown if any upload fails.
  - **Merged tenant Billing page**: `/my/billing` now hosts `TenantBillingPage` combining both Charges (Outstanding/All tabs + Pay button) and Payment History in one page; old `/my/charges` and `/my/payments` routes redirect to `/my/billing`; `TenantShell` nav updated (single "Billing" tab with `RequestQuoteIcon`); tab `variant` changed from `scrollable` to `standard` — 5 tabs fit without horizontal scroll on mobile.
  - **Duplicate payment prevention**: `paymentRepository` gains `findPendingByChargeId()` and `findCompletedByChargeId()`; `createMyPaymentIntent` returns 409 if a pending or completed payment already exists for the charge; `ledgerRepository.findCharges()` uses a `LATERAL` join to prioritise `completed` over `pending` payments and surfaces `pending` as a distinct charge status; Pay button hidden for any charge that is not `unpaid`.
- [ ] **33. AI agent** — wire up OpenAI integration to Twilio inbound SMS handler, conversation management

---

## Planned Features

See **[ROADMAP.md](ROADMAP.md)** for architecture and implementation plans for:
- AI agent for tenant communications (OpenAI + Twilio/SES)
- Role-based access control — `staff` / property manager role
- Per-table change tracking (`created_by` / `updated_by` on all entities)
- Per-property Twilio number management

---

## Frontend Architecture

The React SPA lives in `frontend/` alongside this API. Full documentation — tech stack decisions, auth flow, folder structure, routing patterns, and how to add a new feature — is in **[frontend/README.md](frontend/README.md)**.

**Quick summary:**

| Concern | Choice |
|---|---|
| Build | Vite 7 (proxies `/api/v1/*` → Express in dev — no CORS config needed) |
| UI Components | Material UI v6 + MUI X DataGrid |
| Routing | React Router v6, `<Bootstrap>` silent-refresh gate, role-based `<ProtectedRoute>` |
| Server state | TanStack Query v5 (one hook file per API domain) |
| Client state | Zustand — auth token + user only |
| Forms | React Hook Form + Zod — all create/edit dialogs |
| HTTP | Axios — shared instance with Bearer token injection + quiet 401 → refresh → retry |
| Auth tokens | Access token in JS memory (15 min) + httpOnly refresh cookie (30 days) |
| Roles → portals | `admin`/`landlord` → permanent sidebar shell at `/`; `tenant` → top-nav shell at `/my` |

**Scaffolded structure:**

```
frontend/src/
├── main.jsx / App.jsx       ← entry point, all providers
├── theme/                   ← MUI createTheme() — ready to customise
├── lib/
│   ├── axios.js             ← Axios instance + 401 interceptor
│   ├── queryClient.js       ← TanStack Query client
│   └── auth.js              ← boot() — silent refresh on app load
├── store/authStore.js       ← Zustand: { user, token, setAuth, clearAuth }
├── api/                     ← Pure async functions (12 files, one per domain)
├── hooks/                   ← TanStack Query wrappers (12 files, one per domain)
├── components/
│   ├── layout/              ← AdminShell, TenantShell, Sidebar, PageContainer
│   ├── common/              ← DataTable, ConfirmDialog, StatusChip, EmptyState, LoadingOverlay, ErrorBoundary
│   └── forms/               ← PropertyForm, UnitForm, TenantForm, LeaseForm, MaintenanceForm
├── pages/
│   ├── auth/LoginPage.jsx
│   ├── admin/               ← 13 pages (Dashboard, Properties, Tenants, Leases, Ledger, …)
│   └── tenant/              ← 5 pages (Dashboard, Payments, Maintenance, Documents, Profile)
└── router/
    ├── index.jsx            ← createBrowserRouter, role redirects
    ├── Bootstrap.jsx        ← silent refresh gate
    ├── ProtectedRoute.jsx   ← role guard
    ├── AdminRoutes.jsx      ← lazy-loaded admin pages
    └── TenantRoutes.jsx     ← lazy-loaded tenant pages
```

**Auth endpoints:**
- `POST /api/v1/auth/refresh` — no header needed, reads the httpOnly cookie, returns `{ user, token }` and rotates the cookie
- `POST /api/v1/auth/logout` — clears the cookie

---

## SES Email Setup

All email (outbound and inbound) flows through **AWS SES** on the `lotlord.app` domain.
Outbound is sent synchronously via the AWS SDK. Inbound emails are routed through
SES → S3 → SQS → Lambda → `POST /api/v1/webhooks/ses`.

The entire AWS infrastructure is provisioned by the CDK stack in `infra/`.

---

### Outbound email flow

```
Service calls sendEmail({ to, subject, html })
  ↓
 src/integrations/email/ses.js  (SES SDK SendEmailCommand)
  ↓
 AWS SES  →  recipient inbox
  from: noreply@lotlord.app
  reply-to: reply@lotlord.app
  config-set: lotlord-config-set  →  bounce/complaint events → SNS → /webhooks/ses/bounce
```

### Inbound email flow

```
Tenant sends email to reply@lotlord.app
  ↓
SES Receipt Rule (MX: inbound-smtp.us-east-1.amazonaws.com)
  ↓  stores raw .eml
S3 bucket  (emails/ prefix)
  ↓  S3 event notification
SQS queue  (ses-inbound-queue, DLQ after 3 failures)
  ↓  Lambda trigger (batch 5)
Lambda  ses-inbound-processor
  ↓  reads .eml from S3, parses with mailparser
  ↓  POST { messageId, fromEmail, subject, text, inReplyTo, … }
POST /api/v1/webhooks/ses  (verified by x-webhook-secret header)
  ↓  emailInboxService.processInboundEmail()
  ↓  dedup (external_id UNIQUE) → match sender → log to notifications_log
  ↓  [AI agent] generates reply → replyToEmail() with In-Reply-To / References headers
```

---

### One-time setup

**Prerequisites**
- AWS account with CLI configured (`aws configure`)
- Node.js 20+ for CDK

**Step 1 — Install CDK dependencies**

```bash
cd infra
npm install
```

**Step 2 — Bootstrap CDK in your AWS account** (one-time per account/region)

```bash
cd infra
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

**Step 3 — Generate a webhook secret**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save this value — you'll use it in a moment as `SES_WEBHOOK_SECRET` and in the CDK deploy command.

**Step 4 — Deploy the CDK stack**

```bash
cd infra
npx cdk deploy \
  --context apiUrl=https://your-app.railway.app \
  --context webhookSecret=<the-secret-from-step-3>
```

The deploy outputs:
- Three **DKIM CNAME** records — add to Squarespace DNS
- **MX record** — add to Squarespace DNS  
- **SPF TXT record** — add to Squarespace DNS at `@`
- **DMARC TXT record** — add to Squarespace DNS at `_dmarc`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the `lotlord-api-ses` IAM user
- `InboundBucketName` for informational reference

**Step 5 — Add DNS records in Squarespace**

In your Squarespace domain DNS panel:

| Type | Host | Value |
|---|---|---|
| `MX` | `@` | `10 inbound-smtp.us-east-1.amazonaws.com` |
| `TXT` | `@` | `v=spf1 include:amazonses.com ~all` |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@lotlord.app` |
| `CNAME` | *(CDK output 1)* | *(CDK output 1)* |
| `CNAME` | *(CDK output 2)* | *(CDK output 2)* |
| `CNAME` | *(CDK output 3)* | *(CDK output 3)* |

Allow up to 48 hours for propagation. SES will verify the domain automatically once DKIM CNAMEs resolve.

**Step 6 — Activate the SES receipt rule set**

After CDK deploys, activate the rule set (required once; CDK cannot do this automatically):

```bash
aws ses set-active-receipt-rule-set --rule-set-name lotlord-ruleset --region us-east-1
```

**Step 7 — Request SES production access**

New SES accounts start in sandbox mode (can only send to verified addresses).
Request production access in the AWS console:
**SES → Account dashboard → Request production access**
Typically approved within a few hours.

**Step 8 — Set environment variables**

In Railway (and your local `.env`):

```dotenv
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<from CDK output>
AWS_SECRET_ACCESS_KEY=<from CDK output>
SES_FROM_ADDRESS=noreply@lotlord.app
SES_REPLY_TO_ADDRESS=reply@lotlord.app
SES_CONFIGURATION_SET=lotlord-config-set
SES_WEBHOOK_SECRET=<the-secret-from-step-3>
```

---

### Testing inbound email locally

The Lambda must reach your local server via a public URL.

**Step 1** — Start ngrok: `ngrok http 3000`

**Step 2** — Redeploy CDK with the ngrok URL:
```bash
npx cdk deploy --context apiUrl=https://abc123.ngrok.io --context webhookSecret=<secret>
```

**Step 3** — Or skip the full pipeline — POST the parsed payload directly:

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/ses \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <your-secret>" \
  -d '{
    "messageId": "<test-id@mail.example.com>",
    "fromEmail": "tenant@example.com",
    "from": "Test Tenant <tenant@example.com>",
    "to": "reply@lotlord.app",
    "subject": "Question about my lease",
    "text": "Hi, when is my next rent due?"
  }'
```

---

### Bounce handling

When SES reports a permanent bounce or spam complaint:
1. SNS notifies `POST /api/v1/webhooks/ses/bounce`
2. The handler sets `email_bounced = true` + `email_bounced_at` on the affected `users` row
3. `notificationService` blocks all future email delivery to bounced addresses (422 error)

To re-enable delivery after a user fixes their email address:
```sql
UPDATE users SET email_bounced = false, email_bounced_at = NULL WHERE id = '<uuid>';
```

---

### Files added / changed

| File | Purpose |
|---|---|
| `infra/lib/email-stack.ts` | CDK stack — SES identity, S3, SQS, Lambda, SNS, IAM |
| `infra/lambda/ses-inbound/index.js` | Lambda — reads .eml from S3, parses, POSTs to API |
| `src/integrations/email/ses.js` | SES outbound: `sendEmail()` and `replyToEmail()` |
| `src/services/emailInboxService.js` | Dedup → sender match → log inbound emails |
| `src/routes/webhooks.js` | `POST /webhooks/ses` + `POST /webhooks/ses/bounce` |
| `src/dal/userRepository.js` | `markEmailBounced()` — called by bounce webhook |
| `migrations/023_ses_email_bounced.sql` | Adds `email_bounced` + `email_bounced_at` to users |

---

## Cost Awareness

Estimated monthly cost at MVP/small scale (1–3 properties, ~20–50 tenants):

| Service | Est. Monthly | Notes |
|---|---|---|
| Railway (Hobby) | ~$5 | API + PostgreSQL |
| AWS SES | ~$0.10/1k emails | Practically free at this scale |
| AWS S3 | ~$0.50 | Storage + data transfer at small scale |
| Twilio SMS | ~$3–10 | $1/mo per number + $0.008/SMS |
| OpenAI (GPT-4o-mini) | ~$5–30 | Biggest variable — depends on AI use |
| Stripe | 0.8% per ACH txn | No monthly fee; cap $5 per transaction |
| **Total** | **~$14–50/mo** | **~$168–600/yr** |

> The AI agent is the main cost wildcard. Rate-limit AI replies per tenant and monitor token usage via the `ai_messages.tokens_used` column.

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://user:password@host:port/dbname
# Set to 'false' only if your DB uses an untrusted self-signed cert (uncommon)
# DATABASE_SSL_REJECT_UNAUTHORIZED=true
# Optional custom CA bundle (PEM)
# DATABASE_SSL_CA=-----BEGIN CERTIFICATE-----\n...

# Auth
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_jwt_secret_here
# Separate secret for refresh tokens (strongly recommended in production)
# Falls back to JWT_SECRET + '_refresh' if not set
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_EXPIRES_IN=15m           # access token  (short — in-memory on client)
JWT_REFRESH_EXPIRES_IN=30d   # refresh token (long  — httpOnly cookie)

# AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=              # output by CDK stack
AWS_SECRET_ACCESS_KEY=          # output by CDK stack
SES_FROM_ADDRESS=noreply@lotlord.app
SES_REPLY_TO_ADDRESS=reply@lotlord.app
SES_CONFIGURATION_SET=lotlord-config-set
SES_WEBHOOK_SECRET=             # shared secret for Lambda→API auth

# AWS S3
S3_BUCKET_NAME=lotlord-files

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
APP_BASE_URL=https://your-app.railway.app

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=          # required — from Stripe Dashboard → Webhooks → signing secret
STRIPE_PRICE_ID_STARTER=price_...   # Starter plan — $15/mo — price nickname must be 'starter'
STRIPE_PRICE_ID_ENTERPRISE=price_... # Enterprise plan — $49/mo — price nickname must be 'enterprise'
# Stripe webhook events to enable in the Dashboard:
#   customer.subscription.created, customer.subscription.updated,
#   customer.subscription.deleted, customer.subscription.trial_will_end,
#   invoice.payment_failed
# ACH micro-deposit verification uses Stripe Financial Connections (automatic,
# no extra config) or manual micro-deposits — both work out of the box.

# OpenAI
OPENAI_API_KEY=

# Error alerting (production only)
ALERT_EMAIL=
```

---

## Developer Notes

### Folder Structure (Recommended)

```
property-manager/
├── src/
│   ├── config/          # env vars, db connection, redis client
│   ├── routes/          # Express route definitions
│   ├── controllers/     # Handle req/res, delegate to services
│   ├── services/        # Business logic (e.g. LeaseService, LedgerService)
│   ├── dal/             # SQL queries — the only layer that touches the DB
│   ├── queues/          # BullMQ queue definitions and workers
│   ├── jobs/            # node-cron scheduled job definitions
│   ├── middleware/      # auth, error handling, validation
│   ├── integrations/    # AWS SES, S3, Twilio, Stripe, OpenAI wrappers
│   └── utils/           # shared helpers (date formatting, template rendering, etc.)
├── migrations/          # SQL migration files
├── seeds/               # Dev seed data
├── frontend/            # React SPA (Vite + MUI + TanStack Query + Zustand)
│   ├── src/
│   │   ├── api/         # Pure async Axios functions (one file per domain)
│   │   ├── hooks/       # TanStack Query wrappers (one file per domain)
│   │   ├── pages/       # admin/ and tenant/ page components
│   │   ├── components/  # layout/, common/, forms/
│   │   ├── store/       # Zustand auth store
│   │   ├── router/      # createBrowserRouter, Bootstrap, ProtectedRoute
│   │   └── lib/         # axios.js, queryClient.js, auth.js
│   └── package.json
├── .env.example
├── README.md
└── package.json
```

### Key Rules

1. **Controllers never query the database directly** — always go through a service or dal module
2. **The `ledger_entries` table is immutable** — no UPDATE or DELETE, ever
3. **All file URLs stored in the DB** point to S3 keys — update the `integrations/storage` module if switching S3 buckets
4. **All email sending goes through `integrations/email`** — swapping Gmail → SES means changing one file
5. **Background jobs must log to `notifications_log`** — this is how you audit what was sent and when
6. **AI agent conversations must be stored** — every inbound and outbound message goes into `ai_messages` before any reply is sent

### Scaling Checklist (When Ready)

- [x] Swap `integrations/email/gmail.js` → `integrations/email/ses.js` (done)
- [x] Swap `integrations/storage/googledrive.js` → `integrations/storage/s3.js` (done; googledrive.js removed)
- [ ] Migrate Railway PostgreSQL → Supabase or AWS RDS (schema is compatible)
- [ ] Add `organizations` table for multi-landlord SaaS support
- [ ] Move Redis/BullMQ to dedicated instance (Upstash or ElastiCache)
