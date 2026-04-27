# LotLord — MVP Pre-Launch Checklist

This document exists so that no matter how much time passes, you always know exactly
what needs to be verified before handing the product to a real user. Work through it
top to bottom. Do not skip sections.

Last reviewed: April 2026 (v1.7.5)

---

## Table of Contents

1. [Infrastructure & Environment](#1-infrastructure--environment)
2. [Stripe End-to-End (Critical)](#2-stripe-end-to-end-critical)
3. [Email Deliverability](#3-email-deliverability)
4. [Known Open Issues](#4-known-open-issues)
5. [Automated Test Suite](#5-automated-test-suite)
6. [Manual QA — Landlord First 30 Minutes](#6-manual-qa--landlord-first-30-minutes)
7. [Manual QA — Tenant First 10 Minutes](#7-manual-qa--tenant-first-10-minutes)
8. [Mobile Smoke Test](#8-mobile-smoke-test)
9. [Security & Data Isolation](#9-security--data-isolation)
10. [Pre-Push Release Checklist](#10-pre-push-release-checklist)
11. [Post-Launch Monitoring](#11-post-launch-monitoring)
12. [Before User 10 — Infrastructure Debt](#12-before-user-10--infrastructure-debt)

---

## 1. Infrastructure & Environment

These must be set before the app can function at all.

### Railway — API service environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Railway PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Strong random string, never rotate without a plan |
| `JWT_REFRESH_SECRET` | ✅ | Independent secret for refresh tokens |
| `FRONTEND_URL` | ✅ | Your Vercel URL, **no trailing slash** — used for Stripe redirect URLs |
| `STRIPE_SECRET_KEY` | ✅ | `sk_live_…` from Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `whsec_…` — from Stripe webhook endpoint after creation |
| `STRIPE_PRICE_ID_STARTER` | ✅ | `price_…` — copy from Stripe after creating the Starter product |
| `STRIPE_PRICE_ID_ENTERPRISE` | ✅ | `price_…` — copy from Stripe after creating the Enterprise product |
| `STRIPE_PRICE_ID_COMMERCIAL` | ✅ | `price_…` — flat base price, nickname must be `commercial` |
| `STRIPE_PRICE_ID_COMMERCIAL_UNIT` | ✅ | `price_…` — per-unit add-on, nickname must be `commercial_unit` |
| `AWS_REGION` | ✅ | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | ✅ | IAM user with SES + S3 permissions |
| `AWS_SECRET_ACCESS_KEY` | ✅ | Matching IAM secret |
| `SES_FROM_ADDRESS` | ✅ | Verified SES sending identity |
| `S3_BUCKET_NAME` | ✅ | Bucket for document uploads |
| `TWILIO_ACCOUNT_SID` | Optional | SMS notifications |
| `TWILIO_AUTH_TOKEN` | Optional | SMS notifications |
| `TWILIO_PHONE_NUMBER` | Optional | E.164 format |
| `APP_BASE_URL` | ✅ | Same as FRONTEND_URL or Railway API URL depending on context |

### Stripe Dashboard setup

- [ ] Three products created: **Starter** ($15/mo), **Enterprise** ($49/mo), **Commercial** ($79/mo + $2/unit)
- [ ] Each price has the correct **nickname** set (`starter` / `enterprise` / `commercial` / `commercial_unit`)
      — the webhook uses the nickname to set `subscription_plan` in the DB; wrong nickname = broken plan-gating
- [ ] Webhook endpoint registered at `https://<your-api-domain>/api/v1/webhooks/stripe`
- [ ] Webhook listens to these events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `customer.subscription.trial_will_end`
  - `account.updated`
- [ ] **Customer Portal** enabled (Billing → Customer portal) with:
  - Allow customers to switch plans (all three plans listed)
  - Allow customers to cancel
  - Allow customers to update payment methods

### AWS SES

- [ ] SES is **out of sandbox mode** — sandbox restricts sending to verified addresses only,
      which means you cannot email any new user who has not verified their address in AWS
- [ ] Sending domain or email address is verified
- [ ] SPF / DKIM records are set on your domain DNS
- [ ] Send a test email to a fresh Gmail and a fresh Outlook account — confirm it lands in inbox, not spam

---

## 2. Stripe End-to-End (Critical)

Run this entire script in **Stripe test mode** (`sk_test_…`) against a staging environment
before switching to live keys. Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Insufficient funds: `4000 0000 0000 9995`
- ACH test account: `000123456789` routing `110000000`

### 2A — SaaS subscription lifecycle

- [ ] Landlord signs up → navigates to Profile → Subscription section loads without blank state
- [ ] Clicks "Subscribe to Starter" → redirected to Stripe Checkout → completes payment
- [ ] Returns to `/profile?billing=success` → success banner shown → plan chip updates to "starter"
- [ ] Plan-gated features (Analytics, Portfolio) are now accessible
- [ ] Landlord opens Stripe Customer Portal → upgrades to Enterprise → returns to profile → chip updates
- [ ] Simulate `invoice.payment_failed` via Stripe CLI → `past_due` status → profile shows warning + "Update Payment Method" button
- [ ] Landlord cancels via portal → returns → plan chip shows "canceled" → plan-gated features are blocked
- [ ] Landlord re-subscribes → access restored

**Stripe CLI commands to test webhook events locally:**
```bash
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

### 2B — Stripe Connect (landlord payout account)

- [ ] Free landlord signs up → profile shows "Set Up Payouts" warning
- [ ] Clicks button → redirected to Stripe Connect onboarding
- [ ] Completes onboarding → returns to `/profile?connect=success` → banner shown, warning gone
- [ ] `stripe_account_onboarded = true` is set in DB (verify via admin panel or DB)

### 2C — ACH rent payment (tenant → landlord)

- [ ] Tenant visits Profile → adds bank account via Stripe SetupIntent
- [ ] Micro-deposit verification link shown for unverified bank — tenant clicks → completes on Stripe-hosted page
- [ ] Bank account shows as verified
- [ ] Landlord creates a charge → tenant sees it on Charges page
- [ ] Tenant taps "Pay" → selects bank account → confirms
- [ ] Payment intent created → Stripe processes → `rent_payments` row status updates to `completed`
- [ ] Ledger updates — `totalPaid` increases, `amountDueNow` decreases
- [ ] Tenant can download payment receipt PDF
- [ ] Funds routed to landlord's Connect account (check Stripe Dashboard → Connect → Payouts)

---

## 3. Email Deliverability

- [ ] Tenant invitation email arrives in inbox (not spam) for a fresh Gmail account
- [ ] Lease activation email fires when landlord creates a lease
- [ ] Rent reminder fires (check `jobs/rentReminder.js` cron is running on Railway)
- [ ] Late fee notification fires after grace period
- [ ] Lease expiry warning fires
- [ ] Password reset email arrives and link works within token expiry window
- [ ] Subscription payment failed email arrives for `past_due` landlord

---

## 4. Known Open Issues

These are bugs/gaps identified but not yet fixed. Resolve before onboarding users.

### MUST FIX before first user

- [ ] **Unit/property limit hits silent 403 with no user feedback**
      When a free landlord tries to add more units/properties than their plan allows,
      the request fails with a generic auth error and no UI explanation.
      Fix: backend should return `{ code: 'PLAN_LIMIT_EXCEEDED', message: '...' }` and
      the frontend should catch it and show an inline alert with an "Upgrade Plan" CTA.
      *Tracked in todo.txt*

### SHOULD FIX before 10 users

- [ ] **SaaS Multi-Tenancy (`organization_id`)**
      Data isolation is currently enforced by `owner_id` at the query level. A missing
      `WHERE` clause in any new query would expose cross-landlord data. Adding
      `organization_id` as a first-class FK on all tenant-data tables before scaling
      is documented in ROADMAP.md under Tier 3.

---

## 5. Automated Test Suite

Run before every push to main.

```powershell
npx jest tests/charges.test.js tests/ledger.test.js tests/payments.test.js tests/auth.test.js tests/leases.test.js tests/billing.test.js --testTimeout=30000 --runInBand
```

All tests must pass (exit code 0). Currently: **108 tests passing**.

**What the tests cover:**
- Auth flows (login, refresh token rotation, logout invalidation, password reset single-use)
- Lease lifecycle (create, status, scoping)
- Charges (create, void, partial payment guard, cross-landlord 403)
- Ledger (amountDueNow, totalPaid, statement, PDF, employee scoping)
- Payments (list, chargeId filter, cross-lease security guard, manual recording, Stripe PI guards)
- Billing (subscription status, checkout, portal, plan-gating middleware)
- Cross-tenant isolation (landlordA cannot read landlordB's data on all resources)

---

## 6. Manual QA — Landlord First 30 Minutes

Use a **clean account** (fresh email, no existing data). This simulates a real new user.

### Step 1 — Onboarding
- [ ] Sign up → land on Dashboard → task list is visible
- [ ] Task list items are all unchecked (fresh account)
- [ ] No console errors

### Step 2 — Property setup
- [ ] Click "Add Property" from task list or Properties tab
- [ ] Select property type (Single-family / Multi-family / Commercial)
- [ ] For multi-family: unit number entry is clear and works (e.g. 101, 102, 103)
- [ ] Property and units appear in Properties tab
- [ ] Unit shows "Vacant" status
- [ ] Task list: "Add your first property" checks off

### Step 3 — Tenant invite
- [ ] Navigate to Tenants → "Invite Tenant"
- [ ] Enter email → send invite
- [ ] Invitation email arrives (check inbox, not spam)
- [ ] Task list: "Invite your first tenant" checks off
- [ ] Tenant row appears in Tenants tab with "Pending" chip

### Step 4 — Tenant accepts (switch to tenant account)
- [ ] Open invite link from email
- [ ] Sign up flow completes
- [ ] Redirected to tenant portal (not admin)
- [ ] Back in landlord account: tenant row now shows "Accepted" chip

### Step 5 — Lease creation
- [ ] Navigate to Tenants → select tenant → "Create Lease"
  OR navigate to Leases → "New Lease"
- [ ] Select the unit, set dates, monthly rent
- [ ] Optionally attach a signed lease PDF
- [ ] Submit → lease created → tenant immediately visible on the lease
- [ ] Unit status changes from "Vacant" to "Occupied"
- [ ] Lease status is "active" (not "pending")
- [ ] Activation email sent to tenant
- [ ] Task list: "Create a lease" checks off

### Step 6 — Charges
- [ ] Navigate to Charges → "New Charge"
- [ ] Create a rent charge for this month, due today
- [ ] Charge appears in the grid with status "Unpaid"
- [ ] "Add Manual Payment" button visible → click → record a cash payment
- [ ] Charge status updates to "Paid" or "Partial" depending on amount
- [ ] Payment History icon appears → click → shows the payment

### Step 7 — Ledger
- [ ] Navigate to Ledger → select the lease
- [ ] "Amount Due Today" card shows correct amount
- [ ] "Total Collected" card reflects the manual payment
- [ ] Entries list shows dated rows with correct effective dates

### Step 8 — Payout setup (Stripe Connect)
- [ ] Profile → "Set Up Payouts" warning is visible
- [ ] Click → Stripe Connect onboarding → complete
- [ ] Return to profile → warning gone → connect section shows "Connected"

### Step 9 — Subscription (if testing paid features)
- [ ] Profile → Subscription section shows plan cards (no blank state, no loading flash)
- [ ] Click "Subscribe to Starter" → Stripe Checkout → complete with test card
- [ ] Return → plan chip shows "starter" → Analytics tab unlocked

---

## 7. Manual QA — Tenant First 10 Minutes

Use the tenant account created in section 6.

- [ ] Log in → Dashboard shows lease details (property, unit, rent, dates)
- [ ] Dashboard shows "Amount Due Today" and "Next Charge Due" financial summary cards
- [ ] Charges & Payments tab shows the charge the landlord created
- [ ] "Pay" button is visible and tappable
- [ ] Profile → "Add Bank Account" prompt visible if no payment method set
- [ ] Documents tab shows the lease PDF if landlord attached one
- [ ] Maintenance → can submit a new request with photo attachment
- [ ] Submitting a request triggers a notification email to the landlord

---

## 8. Mobile Smoke Test

**Do this on an actual phone, not browser DevTools.** Past releases have had mobile
regressions that DevTools did not catch.

### Tenant (highest priority — this is where churn happens)
- [ ] Dashboard loads correctly, all cards visible
- [ ] Charges list loads, "Pay" button is visible and tappable without horizontal scroll
- [ ] Payment flow completes end-to-end on mobile
- [ ] Navigation works — all tabs reachable

### Landlord
- [ ] Can create a property and add a unit
- [ ] Can create a lease (form is not clipped or broken)
- [ ] Charges page — all action buttons (Edit, Add Payment, History, Void) visible without overflow
- [ ] Ledger loads and is readable

---

## 9. Security & Data Isolation

These are the tests that prevent one landlord from seeing another's data.
The automated test suite covers these — run it and confirm all pass.

**Critical checks (verified by tests):**
- [ ] landlordA cannot read landlordB's properties, units, tenants, leases, charges, payments, or ledger (403)
- [ ] tenantA cannot read tenantB's lease, charges, or payments (403)
- [ ] Employee can only access their employer's data
- [ ] `GET /payments?leaseId&chargeId` — chargeId is verified to belong to the authorised leaseId before returning data
- [ ] Unauthenticated requests to all protected endpoints return 401
- [ ] Tenant cannot access admin/landlord endpoints (403)

**Manual check:**
- [ ] Create two landlord accounts with separate properties — confirm neither can see the other's data
  anywhere in the UI (Properties, Tenants, Charges, Ledger, Documents)

---

## 10. Pre-Push Release Checklist

Run this before every `git push` to main.

```
[ ] npx jest --testTimeout=30000 --runInBand  →  all tests pass
[ ] No lint errors on changed files
[ ] Both package.json files have the new version number
[ ] CHANGELOG.md has an entry for this version
[ ] todo.txt updated (completed items marked [DONE])
```

---

## 11. Post-Launch Monitoring

After the first real user signs up, watch these for 48 hours:

- **Railway logs** — look for unhandled promise rejections, 500 errors, DB connection errors
- **Stripe Dashboard → Events** — confirm webhooks are delivering (no failed events)
- **Stripe Dashboard → Connect** — confirm landlord's payout account is active
- **AWS SES → Sending Statistics** — bounce rate should be < 2%, complaint rate < 0.1%
- **Database** — check that `subscription_plan` and `subscription_status` are set correctly after checkout

Set up Railway's alerting to email you on any 5xx spike.

---

## 12. Before User 10 — Infrastructure Debt

These are not blocking launch but **will cause pain if ignored past ~10 users**.

### SaaS Multi-Tenancy

Currently data is isolated by `owner_id` at the query level. This works but is fragile.
The plan for adding `organization_id` as a proper FK on all tenant-data tables is
documented in [ROADMAP.md](ROADMAP.md#saas-multi-tenancy).

**Do this before opening public signups or reaching 10 active landlords.**

### Per-Record Change Tracking

Most tables do not have `created_by` / `updated_by`. This matters for audit trails once
multiple employees per landlord are common. Documented in ROADMAP.md under Tier 4.

### Test Coverage Gaps

These flows need integration tests added (see ROADMAP.md — Test Coverage Audit):
- Full lease lifecycle (create → expire → unit freed)
- Charge voiding rules (cannot void a charge with a completed payment)
- Invite token expiry and duplicate handling

---

*Keep this file updated as issues are resolved. Move items from "Known Open Issues"
to CHANGELOG.md once fixed.*
