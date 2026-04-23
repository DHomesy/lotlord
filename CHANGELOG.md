# Changelog

All notable changes are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

---
## [1.7.5] — 2026-04-23 — Fix blank subscription section for incomplete/unpaid plans

### Fixed
- **Blank subscription section for incomplete or unpaid Stripe subscriptions** — the plan picker was only shown when `subscription.status` was exactly `'none'` or `'canceled'`. Stripe also emits `'incomplete'` (checkout started, payment never completed) and `'unpaid'` (recurring payment failed and grace period expired), both of which caused the entire subscription section to render completely blank — no plan cards, no manage button, no warning. Fix: condition changed to show plan cards for any status that is not `active`, `trialing`, or `past_due` (which has its own UI), i.e. `!hasStarter(subscription) && status !== 'past_due'`.
- **Blank subscription section during initial query load** — while the subscription status query was in flight, the plan section showed only the heading and description with nothing actionable. A "Loading plan options…" spinner now fills the gap.

---
## [1.7.4] — 2026-04-23 — Subscription upgrade flow

### Fixed
- **`past_due` users had no action path** — the warning alert was shown but no button was rendered, leaving landlords with a failed payment unable to update their card from the UI. A prominent "Update Payment Method" button (→ Stripe Customer Portal) now appears directly below the warning.
- **Active subscribers could not upgrade their plan** — the subscription section only showed "Manage Subscription" with no indication that plan changes were possible. Plan cards for every higher-tier plan are now shown in an "Upgrade your plan" section; each card opens the Customer Portal where Stripe handles the proration and mid-cycle switch. Plan cards for equal or lower tiers are hidden to prevent confusion.
- **Plan picker flashed on load** — `subscription` is `undefined` while the query is in flight, causing the plan-picker cards to briefly render before disappearing for subscribed users. Plan picker is now guarded by `!loadingSubscription`.
- **Checkout failures were silent** — if the Stripe price env var was missing or the API call failed, the "Subscribe" button just reset with no feedback. An error `Alert` now surfaces when the checkout mutation fails.

---
## [1.7.3] — 2026-04-22 — Lease activation flow, charges UX, ledger improvements

### Added
- **Lease activation email (N4-C)** — a fire-and-forget HTML email is sent to the tenant after a lease is successfully created. The email includes property name, unit, monthly rent, and start/end dates. Failure never blocks lease creation.
- **Ledger — Total Collected (N6)** — `GET /api/v1/ledger` now returns `totalPaid` (sum of all `completed` payments for the lease). `LedgerPage` replaces the "Ledger Balance" card with a **Total Collected** card in success-green, giving landlords a clearer at-a-glance view of revenue collected.
- **Charges — Payment History dialog (N3-C)** — a History icon button appears on partial/paid charge rows in the admin Charges page. Opens a dialog listing every payment recorded against that charge (date, method, amount, status).
- **Lease document attach/replace on Edit Lease (N5)** — `EditLeasePage` now shows a "Lease Document" section. Landlords can attach a signed PDF/DOC, view the existing document in a new tab, or replace it. Uses the existing Documents API (`category: lease_agreement`).
- **Tenant dashboard — Financial Summary (N4-B)** — when an active lease exists, the tenant dashboard shows two new cards: **Amount Due Today** (from `amountDueNow`) and **Next Charge Due** (earliest upcoming unpaid charge). Both are hidden until data loads.
- **Tenant dashboard — Pending Lease state (N4-B)** — tenants with a `pending` lease now see a dedicated `PendingLeaseState` view instead of the generic empty state. Shows lease details and a clear explanation that their landlord will activate the lease shortly.

### Changed
- **Charges — "Add Manual Payment" rename (N3-A)** — the Record Payment button tooltip and dialog title are now "Add Manual Payment" for clarity.
- **Charges — Remaining balance in Amount column (N3-B)** — the Amount column in the admin Charges grid now shows the full charge amount plus a "Remaining: $X" sub-line (warning amber) for partial charges, and "Paid in full" (success green) for fully paid charges.
- **Charges — Actions column width** — widened from 120 to 160 px to accommodate up to four action buttons without clipping.
- **Profile — Free-tier upgrade prompt (N2)** — landlords on the free plan see a persistent info `Alert` at the top of their profile page with an "Upgrade Plan" scroll-to link. The alert disappears automatically once a paid plan is active.
- **Ledger service** — `getLedger()` now resolves `totalPaid` in the same `Promise.all` as existing queries — no extra round-trips.

### Fixed
- **CRITICAL — New leases created as `pending` (N4-A)** — `leaseRepository.create()` never passed a `status` value to the INSERT, so the DB `DEFAULT 'pending'` always applied. New leases are now explicitly created as `active`. Existing pending leases are unaffected.
- **Cross-lease payment history leak (security)** — `GET /payments?leaseId&chargeId` did not verify the `chargeId` belonged to the authorised `leaseId`. An authenticated user could pass a valid `leaseId` they own alongside a `chargeId` from a different lease and read its payment history. The controller now resolves the charge record and returns `403` if `charge.lease_id !== leaseId`.
- **Tenant dashboard Past Leases showing pending lease (N4-B)** — the "Past Leases" filter used `status !== 'active'`, which caused a pending lease to appear in the past-leases grid simultaneously with the pending-state banner. Filter now excludes both `active` and `pending`.
- **Activation email — unescaped date fields** — `data.startDate` and `data.endDate` were embedded raw in the HTML email body. They are now passed through the same `esc()` helper used for all other user-controlled values.
- **Tenant Bank Accounts section removed from Profile (N1)** — the "Tenant Bank Accounts" section (tenant picker + ConnectBankDialog) was incorrectly placed on the landlord's own Profile page. Tenants self-serve ACH setup on their own profile. Section fully removed.

### Tests
- **`tests/ledger.test.js`** — added 4 tests for `totalPaid`: field presence, correct sum of completed payments, exclusion of `pending`/failed payments, and `0` for a lease with no completed payments.
- **`tests/payments.test.js`** — added 5 tests for `GET /payments?leaseId&chargeId`: landlord list, tenant list, cross-lease 403 security guard, tenant-foreign-lease 403, and empty-array result.

---
## [1.7.2] — 2026-04-22 — QA fixes: ledger balance, partial payments, manual recording, paygate

### Added
- **Partial payments (tenant)** — `PaymentDialog` on the tenant Charges page now includes an editable **Amount** field (default = full charge amount; for partially-paid charges, default = remaining balance). Tenants can submit any amount between $0.01 and the charge total. The backend `createMyPaymentIntent` validates and forwards the override to Stripe.
- **Manual payment recording (admin/landlord/employee)** — a new **Record Payment** button (green `$` icon) appears on each unpaid or partial charge row in the admin Charges page. Opens `RecordPaymentDialog` with fields: Amount Paid, Payment Date, Method (cash/check/zelle/other), and Notes. Calls `POST /payments` and refreshes the charge + ledger views.
- **Partial charge status** — `findCharges` now computes a `partial` status when the sum of completed payments is greater than $0 but less than the charge amount. The `unpaidOnly` filter now includes partial charges (both need further payment). `StatusChip` already had a `partial` variant (warning/orange).
- **Ledger — Amount Due Today** — `GET /api/v1/ledger?leaseId=x` now returns `amountDueNow` alongside `currentBalance`. `amountDueNow` sums only non-voided charges with `due_date <= TODAY` minus completed payments, excluding future-dated charges. `LedgerPage` shows a new **Amount Due Today** card (colour-coded) and renames the old card to **Ledger Balance** with a note explaining it includes future charges.
- **Team tab hidden for free landlords** — the Team nav item now requires the Starter plan. Free-tier landlords no longer see the Team link in the sidebar. `Sidebar.jsx` calls `useMySubscription()` (TanStack Query cache hit, no extra request) and filters items with `planRequired: 'starter'`.
- **`zelle` payment method** — added to the `paymentMethod` enum in `createPaymentValidators` and to the `RecordPaymentDialog` method select.

### Fixed
- **Automation tab** — removed per-card "Template: rent_due" edit button and the nav link to the Templates page. Intro text updated to read-only direction.
- **Manual payment against partial charge (Bug A — critical)** — `recordManualPayment` previously used `findCompletedByChargeId` to detect duplicate payments, which blocked any additional payment against a partially-paid charge. Replaced with `getTotalPaidForCharge` comparison: a 409 is returned only when `totalPaid >= charge.amount`; a 400 is returned when `amountPaid > remaining`. Cash/check/zelle partial-charge payments now work correctly.
- **Stripe PI overpayment on partial charge (Bug B)** — `createMyPaymentIntent` validated `amount <= charge.amount` instead of `amount <= remaining balance`. A tenant could create a Stripe payment intent for more than the outstanding balance on a partially-paid charge. Now validates against remaining balance.
- **Tenant PaymentDialog max amount (Bug C)** — `maxAmount` used the full charge amount for partial charges, allowing the tenant to enter more than the remaining balance. Now uses `charge.amount - charge.total_paid` when `charge.status === 'partial'`.
- **Admin RecordPaymentDialog defaults (Bug D)** — the form reset used the full charge amount as default and max for partial charges. Now defaults to and caps at remaining balance.
- **LedgerPage negative amount display (Bug E)** — the Amount Due Today and Ledger Balance summary cards used raw `$${value}` string interpolation, rendering negative values as `$-200`. Both now use the existing `fmtMoney()` helper (`-$200.00`).
- **`zelle` DB constraint (migration 027)** — the `rent_payments_payment_method_check` constraint did not include `zelle`, causing DB errors when recording a zelle payment even though the validator accepted it. Migration 027 drops and recreates the constraint with `zelle` included.
- **Tenant payment history date (Bug F)** — the Payment History table on the tenant Charges page used `created_at` (DB row insert timestamp) as the Date column instead of `payment_date` (the actual payment date field). Fixed to use `payment_date`, consistent with the 1.7.1 changelog intent.
- **Void button shown on partial charges (Bug G)** — the admin Charges page showed the Void button for partial charges (status `partial`), but the backend correctly rejects any void attempt on a charge that already has a completed payment. The button now uses a separate `canVoid` guard that also excludes partial charges, eliminating the confusing 409 error. The Edit button retains its original `canEdit` guard (partial charges remain editable).

---
## [1.7.1] — 2026-04-21 — Payments tab consolidated into Profile

### Changed
- **Payments tab removed from Finance nav** — the standalone `/payments` (Stripe ACH bank account setup) page has been removed from the Finance sidebar group. Finance now contains only **Ledger** and **Charges**, reducing nav noise.
- **Profile — Tenant Bank Accounts section added** — ACH bank account management (tenant picker, saved bank accounts, Connect Bank dialog) is now embedded in `ProfilePage` as a new "Tenant Bank Accounts" section, positioned between Payout Account and Subscription. The section is landlord-only; employees continue to see the existing employer-managed info alert.
- **`/payments` route redirects to `/profile`** — any bookmarked or linked `/payments` URLs are automatically redirected so no hard 404s occur.

---
## [1.7.0] — 2026-04-21 — UX polish sprint: Team page, Messages redesign, Ledger audit, Navbar restructure

### Added
- **Team Members page** (`/team`) — dedicated route for employee management, replacing the old "Team Members" tab on `TenantsPage`. Shows active members (accepted employee invitations), pending invitations, and expired invitations with status chips. Includes an "Invite Employee" button (plan-gated for free tier), resend, and revoke actions. Visible to admin and landlord roles only.
- **MessagesPage — 3-tab rebuild** — `MessagesPage` rebuilt from a single-panel inbox into a three-tab layout:
  - **Conversations** — existing inbox/thread UI with paygate for free-tier users.
  - **Notification Log** — full filterable log of all sent/received notifications (absorbs the former standalone Notifications page). Available to admin, landlord, and employee roles.
  - **Automation** — read-only cards showing scheduled automation rules (Rent Reminder, Late Fee, Lease Expiry) with schedule, description, and a link to the notification template. Paygate alert for free tier.
- **Sidebar nav groups** — navigation restructured into four labelled groups: **Core** (Dashboard, Properties, Tenants, Team, Leases, Maintenance, Documents), **Finance** (Ledger, Charges, Payments), **Communication** (Messages, Templates), **Settings** (Users, Subscriptions, Audit — admin-only). Ungrouped: Profile.

### Changed
- **Ledger date accuracy** — `findByLeaseId` now computes `effective_date` via LEFT JOINs: charge entries use `rent_charges.due_date`, payment entries use `rent_payments.payment_date`. Ledger rows are ordered by `effective_date ASC, created_at ASC`. The `Date` column in `LedgerPage` now reads `effective_date` instead of `created_at`.
- **Money formatting** — shared `fmtMoney` formatter introduced in `LedgerPage`: uses `Intl.NumberFormat` with `minimumFractionDigits: 2`; handles negative amounts correctly as `-$500.00` (was `$-500`). Portfolio summary uses the same formatter.
- **Tenant Payments date column** — the `Date` column now reads `payment_date` (the actual payment date) instead of `created_at` (the DB row insert time).
- **TenantsPage** — stripped of all Team Members tab code. Now shows tenant invitations only, filtered to `type !== 'employee'`, keeping the UI unambiguous.
- **Notification Log route access** — `GET /notifications/log` extended to `anyStaff` middleware (`admin`, `landlord`, `employee`) so employees can view the log via the Messages tab.

### Fixed
- **Sidebar active-state bug** — nav items using `startsWith(item.path)` would highlight multiple items (e.g. `/notifications` highlighted when on `/notifications/templates`). Fixed to `startsWith(item.path + '/')` with an exact-match fallback.
- **Notifications nav item removed** — `NotificationsPage` no longer has a sidebar link. Notification history is now accessible via Messages → Notification Log tab, keeping the nav clean.

---
## [1.6.1] — 2026-04-19 — Frontend role-gating audit, employee UI, LedgerPage property meta

### Added
- **TenantsPage — Team Members tab** — landlord/admin can now invite employees directly from the Tenants page. A new "Team Members" tab lists all employee-type invitations (pending / accepted / expired) with status chips. An "Invite Employee" dialog collects name + email, calls `POST /invitations/employee`, and explains the employee's access scope. Employees are hidden from this tab (they cannot recruit other employees).
- **`createEmployeeInvitation` API function + hook** — `frontend/src/api/invitations.js` gains `createEmployeeInvitation`; `frontend/src/hooks/useInvitations.js` gains `useCreateEmployeeInvitation`. Both were missing — the employee invite endpoint existed in the backend but was unreachable from the UI.
- **LedgerPage — Property / Unit meta card** — the LedgerTab summary block now shows a "Property / Unit" card alongside Tenant and Current Balance, including address. Fields sourced from `leaseRepo.findById` which already returns `property_name`, `unit_number`, `address_line1`.

### Fixed
- **ChargesPage — employees could void charges** — the Void button had no role guard; employees could soft-delete charges they have no authority to void. Void button is now hidden entirely for `role === 'employee'`. `shouldLoad` also now includes employees so they can view charges without the admin "select a filter first" block.
- **ProfilePage — employees saw blank Stripe sections** — employees landing on Profile saw an empty payout and subscription area. They now see an info card: "You are a team member operating under your employer's account. Billing, payout settings, and subscription management are handled by your employer."
- **PaymentsPage (admin/billing) — employees saw the connect-not-set-up banner** — the warning alert "Your Stripe payout account is not set up" was shown to employees who cannot act on it. Banner is now conditionally hidden for `role === 'employee'`; employees see an info alert directing them to their employer instead.
- **DashboardPage — employees saw landlord upgrade CTA** — the 402 upgrade prompt ("Portfolio analytics are available on the Starter plan…") included an "Upgrade Plan" button for employees, who cannot manage subscriptions. Button hidden for employees; message updated: "Contact your employer to upgrade."
- **UsersPage — stale `'staff'` role in Zod schema** — the create-user form schema was `z.enum(['admin', 'staff', 'tenant'])` and the dropdown showed "Staff". Updated to `'employee'` throughout.
- **Sidebar — Subscriptions hidden from landlords** — the Subscriptions nav item had `roles: ['admin']` only, meaning landlords had no sidebar link to their own subscription page. Fixed to `roles: ['admin', 'landlord']`.

---
## [1.6.0] — 2026-04-19 — Employee role, payment receipts, account statement PDF, bug fixes, test expansion

### Added
- **Employee role** — full invite-only employee system for landlords to delegate property management access:
  - `migrations/025_employee_role.sql` — extends `users.role` CHECK to include `'employee'`; adds `employer_id UUID REFERENCES users(id) ON DELETE SET NULL`; index on `employer_id`.
  - `migrations/026_invitation_type.sql` — adds `type TEXT CHECK ('tenant','employee') DEFAULT 'tenant'` to `tenant_invitations`.
  - `src/lib/authHelpers.js` (new) — `resolveOwnerId(user)`: returns `user.employerId` for employees, `user.sub` for all other roles. Throws 401 if an employee token is missing `employerId` (prevents stale pre-sprint tokens from silently scoping to wrong data).
  - `src/services/authService.js` — `signToken()` includes `employerId` claim when `role === 'employee'`.
  - Auth middleware (`requiresStarter`, `requiresEnterprise`, `requiresConnectOnboarded`, `checkPlanLimit`) — all use `resolveOwnerId(req.user)` so employee billing/plan checks read the employer's subscription, not the employee's own row.
  - All services and controllers updated to use `resolveOwnerId` for owner-scoped queries (properties, units, leases, tenants, charges, payments, ledger, documents, maintenance, invitations).
  - `POST /invitations/employee` — landlord/admin only; creates a `type='employee'` invitation row.
  - `POST /invitations/accept` — branches on `inv.type`: employee path creates `role='employee'` user with `employer_id = inv.invited_by`, no tenant record; tenant path unchanged.
  - Frontend: employee sees all landlord routes except Subscriptions, Audit, Notification Templates, Users; ProfilePage hides Stripe Connect + subscription sections.
- **Payment receipt PDF** — `GET /payments/:id/receipt` streams a pdfkit PDF receipt (LotLord header, property/unit, tenant, amount, PAID stamp). Auth: tenant (own payment), landlord/employee (own property), admin (unrestricted).
- **Account statement PDF (S9)** — `GET /ledger/statement/pdf?leaseId=&from=&to=` streams a multi-page pdfkit financial accounting statement:
  - Same access control as `GET /ledger/statement`.
  - Document includes: tenant/landlord/property meta block, date-filtered ledger entry table (Date | Description | Type | Charges | Payments | Running Balance), page-break guard, official footer.
  - pdfkit `doc.on('error')` handler prevents partial responses from hanging the client if generation fails after the pipe starts.
  - Filename: `statement-<leaseId-short>-<from>-<to>.pdf`.
- **Frontend statement PDF button** — "Download Statement (PDF)" button on tenant Payments page replaced the previous CSV export; calls `GET /ledger/statement/pdf` and triggers a browser file download via blob URL.
- **`GET /ledger/statement`** — JSON date-filtered ledger entries for a lease. Returns `{ leaseId, from, to, entries[] }`. Same RBAC as the ledger endpoint.

### Fixed
- **`getReceipt` tenant access check field mismatch** — `leaseRepo.findById` returns `tenant_record_id` (aliased column) but the access guard was comparing against `lease.tenant_id`. Every legitimate tenant received 403 when downloading their own receipt. Fixed to `lease.tenant_record_id`.
- **`resolveOwnerId` silent fallback removed** — stale employee JWTs without `employerId` claim previously fell back to `user.sub`, silently scoping the employee to their own (empty) data. Now throws `{ status: 401, message: 'Employee token missing employerId claim' }` to force re-login.
- **`createInvitation` implicit type** — `invitationRepo.create()` was called without `type` in `createInvitation()`, relying on the repo default. Now explicitly passes `type: 'tenant'` to prevent silent breakage if the repo signature changes.
- **`migrate.js` SSL misconfiguration** — `rejectUnauthorized` was hardcoded to `false` in the migration runner regardless of environment. Fixed to match `db.js`: reads `DATABASE_SSL_REJECT_UNAUTHORIZED` env var; defaults to `true` (secure) in production.
- **Ledger statement response test shape** — statement tests were asserting `Array.isArray(res.body)` but the endpoint wraps entries in `{ leaseId, from, to, entries }`. Fixed all assertions to check `res.body.entries`.
- **`ledger_entries` test fixture** — `balance_after` column is NOT NULL; test insert was omitting it, crashing `beforeAll` and failing all 13 ledger tests. Fixed insert to include `balance_after: 0`.

### Tests
- **`tests/authHelpers.test.js`** (new) — 7 pure-unit tests for `resolveOwnerId`: all roles, employee with/without `employerId`, throw on missing claim.
- **`tests/middleware.test.js`** (new) — 21 pure-unit tests (no DB, jest mock for `userRepo`):
  - `authorize()`: allowed role, disallowed role, missing `req.user`, employee through employee-permitted route, employee blocked from landlord-only route.
  - `requiresStarter()`: admin bypass, active/trialing pass, null/cancelled billing blocks, **employee billing check uses `employerId` not `sub`**, employee employer with no subscription blocked, missing `req.user`.
- **`tests/employee.test.js`** (new) — 11 integration tests covering employee invite gate (landlord-only), property/unit scoping (employer's data only), plan limit billing reads employer.
- **`tests/invitations.test.js`** — added 3 employee acceptance tests: creates `role=employee` user with correct `employer_id`, double-accept returns 410, missing `acceptedTerms` returns 400.
- **`tests/payments.test.js`** — added 8 receipt IDOR tests (tenant own → 200+PDF, cross-tenant → 403, landlord own → 200+PDF, cross-landlord → 403, unauthenticated → 401, 404 for missing; employee scoping: own employer → 200, other landlord → 403).
- **`tests/ledger.test.js`** — added 10 statement JSON tests (IDOR, date filter, empty range) + 10 statement PDF tests (IDOR, date filter, 400/401/404 guards, employee scoping).
- **`tests/helpers/setup.js`** — added `fx.employeeA` fixture: `role='employee'` user with `employer_id = landlordAId`; JWT includes `employerId` claim. `makeToken()` accepts extra claims via spread.
- Total test count: **135 tests → 192 tests across 14 suites**, all passing.

---
## [1.5.14] — 2026-04-18 — ACH micro-deposit verification, maintenance notifications, subscription webhook lifecycle, security audit

### Added
- **ACH micro-deposit verification** — full end-to-end flow for bank accounts that require micro-deposit verification before charges can be processed:
  - `stripeService.listPaymentMethods`: parallel fetch of payment methods + SetupIntents; returns `verified: bool` and `hostedVerificationUrl` per payment method.
  - `stripeService.createPaymentIntent`: throws `{ status: 422, code: 'BANK_NOT_VERIFIED' }` when a charge is attempted against an unverified bank account (checks `err.code === 'payment_method_bank_account_unverified'`).
  - `ConnectBankDialog.jsx`: detects micro-deposit case (`setupIntent.status === 'requires_action'` + `next_action.type === 'verify_with_microdeposits'`) and shows a warning-themed "Check Your Bank Account" screen with a hosted verification link instead of a success screen.
  - `ProfilePage.jsx`: bank cards show a green "Verified" chip or a warning "Verification pending" chip with a direct "Verify →" link to the Stripe-hosted verification page.
  - `ChargesPage.jsx`: auto-selects first verified payment method; unverified methods are disabled in the payment method list with a "— verification pending" suffix; "Confirm Payment" is disabled when selected method is unverified; shows a warning `Alert` when all methods are unverified.
- **Maintenance status notifications** — `maintenanceService` fires email + SMS notifications on maintenance lifecycle events:
  - `createRequest`: fires `maintenance_submitted` notification to the property owner; skips when submitter is the owner.
  - `updateRequest`: fires `maintenance_in_progress` or `maintenance_completed` to the original submitter on status change; skips self-notification.
  - All notifications are fire-and-forget (never block the HTTP response).
- **Subscription webhook: trial ending** — `customer.subscription.trial_will_end` event handled in `handleWebhookEvent`; calls new `onSubscriptionTrialEnding()` which fires a `subscription_trial_ending` email to the landlord.
- **Subscription webhook: payment failed email** — `invoice.payment_failed` handler now fires a `subscription_payment_failed` email notification to the landlord in addition to setting `subscription_status = 'past_due'`.
- **`migrations/024_notification_templates_seed.sql`** (new migration) — expands the `trigger_event` CHECK constraint to include `maintenance_submitted`, `maintenance_in_progress`, `maintenance_completed`, `subscription_payment_failed`, and `subscription_trial_ending`; seeds 5 default email templates with `NOT EXISTS` guards (idempotent).
- **`tests/billing.test.js`** (new suite) — 24 tests covering billing status, Stripe Checkout, Customer Portal, admin landlord list, webhook signature validation, and the `requiresStarter` access gate (including `past_due` and `canceled` blocking, admin bypass, active/trialing pass-through).
- **Test coverage expansion** — 13 new maintenance tests (RBAC, cross-landlord blocking, tenant cancel rules, timestamps); 18 new ACH access-control tests for all 5 Stripe payment routes. Total: 135 tests across 12 suites, all passing.

### Fixed
- **Webhook 400 / 500 error split** (`src/routes/webhooks.js`) — the `catch` block previously returned `400` for all errors. Stripe treats any `4xx` as "do not retry", meaning DB failures during webhook processing caused silent event loss. Fixed: `StripeSignatureVerificationError` → `400` (correct; Stripe should not retry bad signatures); all other errors → `500` so Stripe retries with exponential backoff.
- **`invoice.paid` status race** — removed the `case 'invoice.paid'` handler and `onInvoicePaid()` entirely. It was racing with `customer.subscription.updated` to write `subscription_status`, creating an unreliable update order. `onSubscriptionUpdated` is now the single authoritative path for all subscription status writes.
- **Price ID fallback bug** (`onSubscriptionUpdated`) — when a Stripe Price object has no nickname set, the plan nickname fallback was `price.id` (a raw Stripe ID string like `"price_1AbcXYZ"`). All plan-check middleware (`requiresStarter`, `requiresEnterprise`) was silently failing to match, granting or denying access incorrectly. Fallback is now `null` so failures are explicit.
- **Test suite teardown FK violation** (`tests/helpers/setup.js`) — fire-and-forget notifications were inserting `notifications_log` rows with FKs to test users; `cleanTestFixtures` was deleting users before the log. Added `notifications_log` cleanup step before user deletion to prevent cascading teardown failures across all suites.
- **Properties/units test fixture gaps** (`tests/properties.test.js`, `tests/units.test.js`) — fixed missing `state`/`zip` fields in property create payloads (NOT NULL violation); corrected `subscription_status = NULL` seed to `'none'`; fixed free-plan commercial test to expect `PLAN_LIMIT` (not `COMMERCIAL_REQUIRED`) since `checkPlanLimit` fires before the property type guard.

---
## [1.5.13] — 2026-04-17 — Co-tenants, charges fixes, upgrade UX, documentation pass

### Added
- **Co-tenants per lease** — up to 5 co-tenants can be added to any lease via the Edit Lease page. Co-tenants receive full portal access and can view and pay charges on the lease. Implementation spans:
  - `migrations/023_lease_co_tenants.sql` — new `lease_co_tenants` pivot table (`lease_id`, `tenant_id`, unique constraint) and `lease_id` column added to `tenant_invitations` for future invite-by-lease flows.
  - `src/dal/leaseRepository.js` — `findAllForTenant`, `tenantCanAccessLease`, `findCoTenants`, `addCoTenant`, `removeCoTenant`.
  - `src/dal/ledgerRepository.js` — `forTenantId` filter param on `findCharges` (UNION subquery covers primary tenant + co-tenant leases).
  - `src/controllers/leaseController.js` — `getCoTenants`, `addCoTenant`, `removeCoTenant` handlers; tenant `listLeases` and `getLease` use `tenantCanAccessLease` instead of hard `tenant_id` comparison.
  - `src/controllers/chargesController.js` — tenant charge queries use `forTenantId` so co-tenants see all charges on their shared leases.
  - `src/routes/leases.js` — `GET /:id/co-tenants`, `POST /:id/co-tenants`, `DELETE /:id/co-tenants/:tenantId`.
  - `frontend/src/api/leases.js`, `frontend/src/hooks/useLeases.js` — `useCoTenants`, `useAddCoTenant`, `useRemoveCoTenant`.
  - `frontend/src/pages/admin/EditLeasePage.jsx` — Co-Tenants management section: chip list of existing co-tenants with remove, TenantPicker + Add button (hidden when cap reached).

### Changed
- **Enterprise plan repriced** $50/mo → **$49/mo**. Updated `frontend/src/lib/plans.js` (price field + JSDoc) and the landing page PLANS array.
- **Co-tenant cap** — raised from 3 to **5 co-tenants per lease** (6 occupants total including the primary tenant). Enforced in `leaseRepository.addCoTenant`; reflected in `EditLeasePage` UI copy and the "Add" button visibility guard.
- **Plan upgrade UX** — Dashboard upgrade CTA now navigates to `/profile?upgrade=1`. ProfilePage detects this param, scrolls to the subscription section, and shows an info banner prompting the user to subscribe.
- **Documentation pass** — JSDoc and inline comments updated on all files modified this session: `leaseRepository`, `ledgerRepository`, `chargesController`, `leaseController`, `routes/leases.js`, `api/leases.js`, `hooks/useLeases.js`, and `plans.js` (added price history block).

### Fixed
- **Charges property filter bug** — `findCharges` was filtering on `rc.property_id = $X` (a nullable column frequently not set on charge rows). Fixed to use `p.id = $X` via the existing `units → properties` JOIN, so property-scoped charge queries now return all charges correctly.
- **Charges pending status filter** — The status toggle group on `ChargesPage` had no "Pending" option. Added a "Pending" `ToggleButton` and a corresponding client-side filter branch so in-progress ACH payments are visible.

---
## [1.5.12] — 2026-04-17 — Starter plan repriced to $15/mo; landing page updated

### Changed
- **Starter plan price** — reduced from $29/mo to **$15/mo**. Updated `frontend/src/lib/plans.js` (`price` field + JSDoc) and the `DashboardPage` upgrade alert copy.
- **Landing page pricing section** — updated `PLANS` array to reflect the current Free / Starter ($15) / Enterprise ($50) tier model:
  - Free: now lists ACH rent collection as included (previously omitted after the all-tiers ACH change)
  - Starter: corrected from stale "$19 / 5 properties" to "$15 / up to 25 properties, unlimited units & tenants"
  - Renamed "Pro" tier to **Enterprise** at $50/mo with correct feature set (employee accounts, AI, document signing — all coming soon)
- **Landing page FAQ** — updated "What's included in the free plan?" answer to include online ACH rent collection and remove the incorrect statement that rent collection requires a paid plan.
- **Note for deployment** — create a new $15 Price on the Starter Product in the Stripe Dashboard (existing price IDs cannot be edited), then update `STRIPE_PRICE_ID_STARTER` in your Railway environment variables.

---
## [1.5.11] — 2026-04-17 — Bug fixes: Stripe env var names and stale price copy

### Fixed
- **`STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_ENTERPRISE` env var names** — the root `.env` had these named `STRIPE_PRICE_STARTER_ID` and `STRIPE_PRICE_ENTERPRISE_ID`, which didn't match what `src/config/env.js` reads. Stripe Checkout sessions silently received an empty price ID and returned a 500. Renamed to match the config.
- **Stale `$30/mo` price copy** — corrected to `$29/mo` in three places: `frontend/src/lib/plans.js` JSDoc comment, the `DashboardPage` upgrade alert, and a now-removed `requiresEnterprise` comment in `src/routes/payments.js` that incorrectly described ACH as an Enterprise-only feature.

---
## [1.5.10] — 2026-04-17 — Tier refinements: ACH for all, $29 Starter, plan caps

### Changed
- **Starter plan price** — reduced from $30/mo to **$29/mo**.
- **ACH rent collection available on all tiers** — removed the Enterprise subscription gate from the `POST /payments/stripe/payment-intent` backend route and from `PaymentsPage`. Any landlord (Free, Starter, or Enterprise) who has completed Stripe Connect onboarding can collect rent via ACH. The only gate remaining is `requiresConnectOnboarded` — Stripe Connect setup is still required before accepting payments.
- **Tier property/unit limits revised** — `checkFreeTierLimit` replaced by `checkPlanLimit()`, a new tier-aware middleware that enforces per-plan caps without a hard-coded max argument:
  - **Free**: 1 property, 4 units, 4 active tenants
  - **Starter ($29/mo)**: up to 25 properties, unlimited units & tenants
  - **Enterprise ($50/mo)**: unlimited everything
- **Enterprise plan future features** — Enterprise plan card now advertises AI features and document signing as "coming soon" instead of ACH (which is now available to all tiers).
- **Error messages** — `402` responses from `checkPlanLimit` now include the current plan name and a tier-specific upgrade hint (Free users prompted to Starter **or** Enterprise; Starter users prompted to Enterprise).

---
## [1.5.9] — 2026-04-17 — 3-tier pricing: Free / Starter / Enterprise

### Added
- **3-tier subscription model** — replaced the previous single-plan ("Pro") system with three tiers:
  - **Free** — no subscription required. Core features: 1 property, up to 4 units, 4 active tenants, full maintenance / documents / leases / charge management.
  - **Starter ($30/mo)** — up to 25 properties, plus dashboard analytics and portfolio income summary.
  - **Enterprise ($50/mo)** — unlimited properties, plus future premium features (AI, document signing). ACH rent collection available on all tiers.
- **`frontend/src/lib/plans.js`** (new file) — exports `PLANS` map, `planTier()`, `hasStarter()`, `hasEnterprise()` helpers for consistent plan checks across frontend components.
- **`requiresStarter` / `requiresEnterprise` middleware** (`src/middleware/auth.js`) — two new named subscription gates. `requiresPro` kept as backward-compat alias for `requiresStarter`.
- **Plan-picker UI on ProfilePage** — when unsubscribed, two side-by-side cards (Starter / Enterprise) each show price, description, feature list, and a "Subscribe to [plan]" button. Subscribed users see their current plan name and a "Manage Subscription" button (Stripe Customer Portal).

### Changed
- **`STRIPE_PRICE_ID`** env var split into `STRIPE_PRICE_ID_STARTER` and `STRIPE_PRICE_ID_ENTERPRISE`. The Stripe price nickname must be set to exactly `starter` or `enterprise` in the Stripe Dashboard — the webhook stores this as `subscription_plan` in the DB.
- **`createCheckoutSession(userId, plan)`** — now accepts a `plan` string and routes to the correct price ID.
- **`POST /billing/checkout`** — accepts `{ plan: 'starter' | 'enterprise' }` in the request body.
- **Analytics routes** — `requiresPro` → `requiresStarter` on `GET /analytics/dashboard` and `GET /ledger/portfolio`.
- **DashboardPage / LedgerPage** — replaced inline `isPro` check and `checkout()` upgrade button with `hasStarter(subscription)` and `navigate('/profile')` upgrade CTA.
- **PaymentsPage** — replaced `hasEnterprise` gate with `requiresConnectOnboarded` only (ACH available to all tiers).

---
## [1.5.8] — 2026-04-17 — Full mobile UX audit: admin pages

### Changed
- **Admin Dashboard — responsive activity tables** — "Recent Payments" and "Recent Maintenance" tables now render as a card-per-row layout on mobile (`xs`) instead of a horizontally-scrollable 5-column table. Each payment card shows name + unit on the left and amount + date stacked on the right; each maintenance card shows title + unit on the left and priority/status chips stacked on the right.
- **Admin Charges — fullScreen dialogs on mobile** — Create Charge, Edit Charge, and Void Charge dialogs all switch to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Admin Charges — status filter wraps on small screens** — the All / Unpaid / Paid / Voided `ToggleButtonGroup` now has `flexWrap: 'wrap'` so buttons are never clipped on 320 px screens.
- **Admin Maintenance — fullScreen dialog on mobile** — New Request dialog switches to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Admin Documents — fullScreen dialog on mobile** — Upload Document dialog switches to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Admin Tenants — fullScreen dialog on mobile** — Invite a Tenant dialog switches to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Admin Properties — fullScreen dialogs on mobile** — New Property dialog and the Unit Wizard dialog both switch to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Admin Profile — Payout Account & Subscription section headers stack on mobile** — both section headers (title + action button/chip) changed from `direction="row"` to `direction={{ xs: 'column', sm: 'row' }}` so the button/chip never squishes against the heading text on narrow screens.

---
## [1.5.7] — 2026-04-17 — Mobile UX audit: tenant portal & DataTable

### Fixed
- **DataTable action columns hidden on mobile** — the `MobileCardList` renderer was filtering out columns with `headerName: ''` (Pay, View, etc.) entirely, making those actions unreachable on phones. Action columns are now separated from data columns: data columns render as key-value pairs as before, while action columns (`headerName === ''`) render in a dedicated bottom row inside each card, separated by a divider.

### Changed
- **Tenant Charges — fullScreen PaymentDialog on mobile** — the Pay dialog switches to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Tenant Maintenance — fullScreen Create dialog on mobile** — the Submit Request dialog switches to `fullScreen` mode on `xs`/`sm` breakpoints.
- **Tenant Profile — billing section header stacks on mobile** — the "Payment Method" section header (title + Stripe link button) changed from `direction="row"` to `direction={{ xs: 'column', sm: 'row' }}` to prevent squishing on narrow screens.

---
## [1.5.6] — 2026-04-16 — Tenant charge visibility & lease document attachment

### Fixed
- **Tenant charges page showing no data** — `chargesController.getCharges` now correctly scopes queries by `tenant_id` when the authenticated user is a tenant, so tenants only see their own charges and the page is no longer empty.

### Added
- **Lease document attachment** — landlords can now attach a document (PDF, image, etc.) directly to a lease from the Create Lease dialog and the Edit Lease page. The attachment is stored via the existing S3 document pipeline and linked to the lease record. A download link is shown in the lease detail view on both `LeasesPage` and `PropertyDetailPage`.

---
## [1.5.5] — 2026-04-25 — Charge schedule reliability & security hardening

### Fixed
- **Connection timeout when creating lease charge schedule** — charge schedule creation previously fired N concurrent `POST /charges` requests, exhausting the pg-pool (max 10 connections) on leases with many months. All charges are now created in a single DB transaction via `POST /charges/batch`, eliminating the race.
- **Charges invisible to tenants** — `tenant_id` was not passed to charge creation payloads; all charges had `tenant_id = NULL` and were filtered out of tenant queries. `tenantId` is now included on every charge in the batch.
- **No warning about pre-existing charges** — creating a charge schedule on a unit with existing charges silently duplicated them. The create-lease flow now checks for existing charges before submitting and shows a confirmation dialog with three options: Replace (void all existing + create new schedule), Keep (add alongside existing), or Skip.

### Added
- `POST /api/v1/charges/batch` — creates multiple charges atomically in a single DB transaction; validates array size (max 500), UUID/date/amount/chargeType per item.
- `POST /api/v1/charges/void-by-unit` — voids all unpaid charges for a unit in a single transaction; used by the "Replace" flow.

### Security
- Input validation middleware (`createChargesBatchValidators`, `voidChargesByUnitValidators`) added to both new endpoints — malformed UUIDs, invalid date formats, unrecognised chargeType values, and amount ≤ 0 now return 400 instead of a Postgres 500.
- Batch size capped at 500 items per request to prevent pool exhaustion attacks.

### Tests
- 13 new integration tests in `tests/charges.test.js` covering both new endpoints: success, IDOR 403, validation rejection (empty array, >500 items, bad date, bad chargeType, zero amount), unauthenticated 401, and DB-state verification for void.

---
## [1.5.4] — 2026-04-16 — Email verification bug fix

### Fixed
- **Landlords blocked by email verification gate despite being verified** — `ProtectedRoute` was checking `user.email_verified_at` (the raw DB snake_case field), but the user object in auth state is normalised via `toPublicUser()` and exposes `emailVerified` (camelCase). The field was always `undefined`, so every landlord was redirected to `/verify-email-pending` on login. Changed guard to `!user.emailVerified`.
- **Backend gate blocked tokens without the `emailVerified` claim** — changed `app.js` gate from `!payload.emailVerified` to `payload.emailVerified === false` so tokens issued before the claim was introduced (where the claim is absent, not `false`) are not incorrectly blocked.
- **Users stuck on verify-email page unable to proceed** — when the resend-verification API returns 400 "already verified" (correct — the DB row is verified, only the in-memory token was stale), `VerifyEmailPendingPage` now automatically calls `POST /auth/refresh`, updates auth state with the fresh token, and redirects to `/dashboard` instead of showing an unrecoverable error.

### Changed
- ROADMAP.md rewritten with four strategic tiers: Tier 1 (product viability), Tier 2 (retention & trust), Tier 3 (SaaS readiness), Tier 4 (developer health). All previously documented items preserved with full implementation detail.

---
## [1.5.3] — 2026-04-16 — Additional fees & maintenance photo uploads

### Added
- **Additional Fees section in Create Lease form** — a new section (between Financials and Late Fees) lets landlords add optional recurring fee line items alongside rent (e.g. Water, Electricity, Parking, Pet Fee). Each row has a free-text description and a monthly amount. Fees can be added/removed dynamically with `+` / `×` buttons.
  - When **Charge Schedule** is enabled, each additional fee generates its own full monthly charge schedule using the same due-day and date range as rent charges, with `chargeType: 'other'` and the description set on each charge
  - The charge schedule **preview** now shows a per-fee breakdown and a combined total-per-period line
  - The success toast after lease creation now reports additional fee types (e.g. "12 monthly charge(s) + 1 deposit charge + 2 additional fee types")
- **Admin maintenance request: photo/file attachments** — the Create New Request dialog in the admin Maintenance page now uses `MaintenanceForm` with `showPhotos` enabled, replacing the previous inline form that had no file support. Landlords can attch up to 5 photos/PDFs (20 MB each) before submitting. Partial upload failures surface as a warning alert without rolling back the created request.

### Changed
- Admin `MaintenancePage`'s inline `CreateForm` component removed; `MaintenanceForm` is now the single source of truth for both tenant and admin maintenance request creation

### Tests
- `toPublicUser()` pure-unit test suite added to `tests/auth.test.js` (5 cases covering snake_case mapping, camelCase fallback, null input, missing optional fields, `emailVerified` coercion)
- `tests/helpers/globalSetup.js` added as Jest `globalSetup` — runs all pending SQL migrations against the test DB before any suite runs, preventing schema-mismatch failures (e.g. missing `token_version` column)
- Stale "silently downgrades role:admin" test updated to match the current hardened behaviour (validator now returns 400 for `role: 'admin'`)
- Register integration test now asserts camelCase user shape (`firstName`/`lastName` present, `first_name`/`last_name` absent)

---
## [1.5.2] — 2026-04-16 — QA fixes: UX polish & mobile responsiveness

### Fixed
- **"Welcome, \<email\>" bug** — auth responses (`register`, `login`, `refresh`, `verifyEmail`) now normalise the DB snake_case user row via `toPublicUser()` before sending; frontend receives `firstName`/`lastName`/`avatarUrl`/`emailVerified` consistently in camelCase
- **No tenants in Create Lease dialog** — `TenantPicker` inside `LeaseForm` now passes `includePending: true` (previously only `accepted` tenants appeared, excluding those who signed up via invite but have no lease yet)
- **Setup tasklist invite step never completing** — `LandlordSetupCard` now calls `useTenants({ includePending: 'true' })` so accepted-but-unleased tenants are counted

### Added
- **Inline Create Lease from unit card** — vacant unit rows on `PropertyDetailPage` now have a green "Lease" button that opens a full `LeaseForm` dialog pre-locked to that unit (no unit picker shown); occupied units get a "Lease" button that navigates to `/leases?unitId=…`; navigating to `/tenants` removed
- **"Create your first lease" setup step** — `LandlordSetupCard` now shows a 5th step that completes once the landlord has at least one lease
- **Landlord name in invitation emails** — both the initial invite and the resend now personalise the body and footer with the landlord's full name (e.g., "John Smith has invited you…" / "Sent on behalf of John Smith via LotLord."); falls back gracefully to "Your landlord" if name is unavailable

### Changed
- **Mobile responsive unit list** — `PropertyDetailPage` renders a card-based unit list on `xs`/`sm` breakpoints instead of the DataGrid; each card shows unit number, beds/baths/sqft, rent, tenant name, status chip, and Edit/Lease action buttons
- **FullScreen dialogs on mobile** — Add Unit, Edit Unit, and Create Lease dialogs on `PropertyDetailPage`, `LeasesPage`, and `TenantDetailPage` switch to `fullScreen` mode on `xs`/`sm` breakpoints for better usability on small screens

---
## [1.5.1] — 2026-04-15 — Bugfixes

### Fixed
- Moved `/health` endpoint before CORS middleware so Railway deploy probes are never rejected by the origin allowlist
- Removed auto deposit-charge creation from `leaseService` that was missing `unitId` (NOT NULL violation causing all leases with a deposit to fail silently)
- Fixed UTC date parsing in charge due-date helpers (`getChargeDueDates` / `getMonthlyDueDates`) — `new Date("YYYY-MM-DD")` was resolving as UTC midnight causing off-by-one month in UTC-negative timezones

---
## [1.5.0] — 2026-04-14 — Charge Schedule on lease creation

### Added
- **Charge Schedule section in Create Lease form** — a new collapsible section (toggled by a Switch) lets landlords auto-generate the full set of monthly rent charges at the same time as they create a lease
  - **Live preview** — as dates and rent are entered, a preview box shows the exact count of charges, total dollar amount, and the month range (`12 rent charges × $1,500 = $18,000 total — May 2026 to Apr 2027`)
  - **Configurable due day** — landlords can set the day-of-month each charge is due (1–28); the charge dates shift accordingly while the preview updates in real time
  - **Deposit charge opt-in** — a checkbox creates an additional one-time `other` charge for the security deposit amount on the lease start date
  - Charge creation runs in parallel after the lease is saved; a success alert shows the count created (and deposit line if applicable); a warning alert appears if charges partially failed without losing the created lease
- **Late fee fields on Create Lease** — `lateFeeAmount` and `lateFeeGraceDays` now exposed in the create form (previously only editable after creation)

### Changed
- `LeaseForm` now self-contained: the Charge Schedule is built into the form rather than injected via a `children` slot; form `onSubmit` values include `auto_charges`, `charge_due_day`, and `include_deposit_charge`
- Create Lease dialog widened to `maxWidth="md"` to comfortably fit the two-column grid layout
- Monthly due-date generation updated to respect `charge_due_day` (previously hardcoded to the 1st of the month)
- Post-save success/warning feedback moved to a top-level Alert above the form, with a "Done" button that closes and resets the dialog

---
## [1.4.9] — 2026-04-15 — Security hardening (audit round 3)

### Security
- **`PATCH /users/:id` input validation** — `updateUserValidators` added; `phone` is now validated as a mobile phone number, `avatarUrl` as a URL, `firstName`/`lastName` reject blank strings; validators wired to the route (previously completely unvalidated)
- **Stripe ACH mandate real user-agent** — `createPaymentIntent` now accepts a `userAgent` parameter; both admin and tenant controllers pass `req.get('user-agent')`; the mandate `online.user_agent` field is set to the genuine client user-agent instead of the hardcoded `'server'` string, satisfying Stripe/Nacha ACH compliance requirements
- **Startup warnings for missing webhook secrets** — server now logs a `WARNING` at startup when `NODE_ENV=production` and `TWILIO_AUTH_TOKEN` or `SES_WEBHOOK_SECRET` are absent, making it visible when the Twilio SMS and SES inbound webhooks are operating without signature validation

---
## [1.4.8] — 2026-04-14 — Security hardening (audit rounds 1 medium/low)

### Security
- **Separate JWT secrets** — refresh tokens now use `REFRESH_SECRET` (derived from `JWT_SECRET + '_refresh'` unless `JWT_REFRESH_SECRET` env var is set); a compromised access-token secret can no longer be used to forge refresh tokens
- **`acceptedTerms` required server-side** — `authService.register` and `invitationService.acceptInvitation` now throw 400 if `acceptedTermsAt` is not supplied; `registerValidators` and `acceptInvitationValidators` validate the boolean `true` before the service is called
- **Role enum enforcement** — `registerValidators` now restricts `role` to `['landlord', 'tenant']`; arbitrary role strings are rejected before reaching the service
- **Health endpoint hardened** — removed `env: process.env.NODE_ENV` from `/health` response; the endpoint now returns only `{ status, db, version, uptime }`
- **PATCH input validators added** — five previously unvalidated routes now have validators: `PATCH /leases/:id`, `PATCH /properties/:id`, `PATCH /units/:id`, `PATCH /charges/:id`, `PATCH /tenants/:id`

### Removed
- **Dead Google Drive integration** — `src/integrations/storage/googledrive.js` deleted; `storage/index.js` has always exported S3 only

---
## [1.4.7] — 2026-04-15 — Security hardening (audit rounds 1 & 2)

### Security
- **Refresh token revocation** — `users` table now has a `token_version` column (migration 023); `signRefreshToken` embeds the version and `refreshFromCookie` validates it; calling `POST /auth/logout` increments the version, instantly invalidating all outstanding refresh tokens for that user
- **Database SSL certificate validation** — `rejectUnauthorized` now defaults to `true` in production; override with `DATABASE_SSL_REJECT_UNAUTHORIZED=false` env var if the Railway CA bundle isn't installed
- **Magic-byte file validation (documents)** — `POST /documents` now inspects the actual file header bytes and rejects uploads where the binary content doesn't match the declared `Content-Type`, preventing disguised executables; shared helper extracted to `src/lib/mimeUtils.js`
- **Magic-byte file validation (maintenance attachments)** — `maintenanceService.addAttachment` now applies the same magic-byte check (extended for `video/mp4` and `video/quicktime` via ISO Base Media container detection)
- **Cron advisory locks** — all three scheduled jobs (rent reminders, late fees, lease expiry) are now guarded by `pg_try_advisory_lock`; a second instance of the server skips the job rather than running it concurrently
- **Charges IDOR fix** — `GET /charges?tenantId=<uuid>` no longer trusts the caller-supplied `tenantId` when the role is `tenant`; the tenant's own record is resolved server-side from the JWT, making it impossible to read another tenant's billing history
- **Invitation service stale JWT signing** — removed private `signToken`/`signRefreshToken` copies from `invitationService` that were missing `tokenVersion` and other claims; `acceptInvitation` now calls `authService.issueTokensForUser` for consistent, up-to-date tokens
- **Unit soft delete** — `unitRepository.remove` now issues `UPDATE … SET deleted_at = NOW()` instead of a hard `DELETE`, preventing dangling `unit_id` foreign keys on historical leases and charges
- **Invitation token out of URL path** — `GET /invitations/:token` and `POST /invitations/:token/accept` replaced with `POST /invitations/validate` and `POST /invitations/accept`; the token is now sent in the JSON request body so it is never recorded in server access logs
- **Invitation repository parameter indices** — `invitationRepository.findAll` rewrote the manual `$1/$2/$3` index arithmetic to use the `values.push()` pattern consistent with every other repository, eliminating the risk of an off-by-one parameter binding error
- **Cookie config extracted** — `COOKIE_NAME` and `cookieOptions()` moved from `authController` to `src/config/cookies.js`; `invitationController` now imports from there instead of from another controller

---

## [1.4.6] — 2026-04-14 — Sidebar polish & tenant picker fix

### Added
- **Sidebar user info card** — the navigation sidebar now shows the logged-in user's initials avatar, display name, and role badge (Admin / Landlord / Tenant) at the top above the nav items
- **Sidebar section group labels** — nav items are now grouped under "Core", "Finance", and "Admin" overline headings with dividers between sections so the hierarchy is immediately clear

### Changed
- **Sidebar width** — increased from 240 px to 260 px to accommodate the group labels and remove visual cramping
- **Sidebar nav items** — removed `dense` mode; items use slightly more vertical padding and have rounded-corner selected-state highlighting (filled primary background)
- **AppBar username removed** — the user's name/email is no longer repeated in the AppBar on desktop since it's now visible in the sidebar card
- **Document tenant picker now includes leaseless tenants** — `GET /tenants?includePending=true` uses a `LEFT JOIN` on `leases` plus an `OR` check against `tenant_invitations`; the document upload dialog passes this flag automatically when `Related type = Tenant`, so tenants who accepted an invitation but don't yet have a lease appear in the picker

---

## [1.4.5] — 2026-04-14 — Unit management UX & ledger polish

### Added
- **Unit wizard: starting number field** — the "Add Units" wizard after creating a multi-family/commercial property now includes a "Starting number" input (default `1`); unit numbers are generated as `${prefix} ${start + i}` so users can create `101, 102, 103, 104` directly; the live preview line updates instantly as prefix, count, or start number changes
- **Vacant unit lease guidance** — the unit table on `PropertyDetailPage` now shows a green **Lease** button next to **Edit** for any vacant unit; hovering shows the tooltip *"Go to Tenants to invite a tenant and create a lease for this unit"*; clicking navigates to `/tenants`

### Changed
- **Unit number is now editable** — the unit number field in `UnitForm` was locked (`readOnly`/`disabled`) when editing; both locks removed and `unitNumber` is now included in the `PATCH /units/:id` payload; a helper text note informs the user that the change updates the number everywhere
- **Ledger "Upgrade to Pro" button** — changed from `color="inherit"` (nearly invisible text) to `variant="contained"` to match the dashboard upgrade prompt styling

---

## [1.4.4] — 2026-04-14 — Marketing landing page redesign

### Changed
- **`LandingPage.jsx` full redesign** — rebuilt from scratch with a modern SaaS aesthetic:
  - **Dark hero** with mesh dot-grid background, gradient headline, and three trust-signal chips
  - **Sticky nav** with backdrop blur, in-page anchor links (How It Works, Pricing, FAQ), Log In and Get Started Free CTAs
  - **"How It Works"** section — three numbered steps replacing the previous feature list in the hero area
  - **Features grid** — 6 cards (Properties & Units, Rent Collection, Maintenance, Reminders, Documents, Tenant Portal) with hover lift animation
  - **Revised 3-tier pricing** — Free ($0) / Starter ($19/mo, 5 props / 25 units) / Pro ($49/mo, 20 props / 100 units); replaces the previous 2-tier model to prevent resource abuse on unlimited plans
  - **FAQ section** — 8-question MUI Accordion covering free plan, mobile support, security, cancellation, and plan limits
  - **Final CTA banner** with dark gradient matching hero
  - **Multi-column footer** with product nav links (scroll-to anchors), legal links, and brand tagline

> **Note:** Backend plan enforcement (`auth.js` `checkFreeTierLimit`) still only knows Free vs Pro. A follow-up is needed to add Starter tier limits once the Stripe product is updated.

---

## [1.4.3] — 2026-04-14 — Admin script cleanup

### Changed
- **`scripts/update-admin.js`** — removed the `OLD_EMAIL` env-var requirement; the admin account is now looked up automatically by `role = 'admin'`, so only `NEW_EMAIL` and/or `NEW_PASSWORD` need to be supplied

---

## [1.4.2] — 2026-04-14 — Landlord setup checklist, tenant empty states

### Added
- **`LandlordSetupCard` component** — persistent, self-contained getting-started checklist for new landlords (role `landlord` only, never shown to admin); tracks four milestones: first property, first unit, first tenant invite, and Stripe Connect bank setup; progress bar shows `n / 4` steps complete; dismissable via × button (persisted to `localStorage`); auto-dismisses when all steps are done; rendered on both the Pro analytics dashboard and the free-tier (402) upgrade prompt so it's always visible on first login
- **Tenant maintenance empty state** — `tenant/MaintenancePage` now shows a friendly "You haven't submitted any maintenance requests yet." empty state (using `EmptyState`) instead of an empty table when there are no rows
- **Tenant documents loading & empty state** — `tenant/DocumentsPage` now shows `LoadingOverlay` while fetching and an "No documents have been shared with you yet." empty state when the document list is empty

### Changed
- **`DashboardPage` cleanup** — removed the old inline `SetupChecklist` function and its exclusive MUI imports (`List`, `ListItem`, `ListItemIcon`, `ListItemText`, `CheckCircleIcon`, `RadioButtonUncheckedIcon`); replaced with the new `<LandlordSetupCard />` which is also inserted above the 402 upgrade-prompt path

---

## [1.4.1] — 2026-04-14 — QA patch: free-tier limit, property form UX & tenant portal polish

### Added
- **Tenant dashboard quick-nav cards** — four tappable cards (Charges & Payments, Maintenance, Documents, My Profile) below the lease summary for fast navigation
- **Tenant bank account setup prompt** — persistent `Alert` with "Set up now" CTA on the tenant dashboard when no payment method is linked

### Changed
- **Property form: type selector moved to top** — landlords now choose Single-family / Multi-family / Commercial first; Address Line 2 is hidden for multi-family and commercial (units are added via the unit wizard after creation)
- **Tenant dashboard greeting uses first name** — `firstName` claim added to JWT in `authService.signToken`; tenant greeting now reads "Welcome, Aston" instead of falling back to the email address
- **Tenant shell branding** — `PropertyMgr` → `LotLord` in `TenantShell` AppBar
- **Admin profile page branding** — remaining `PropertyMgr` reference in subscription section replaced with `LotLord`

### Fixed
- **Free-tier limit fires after property deletion** — `checkFreeTierLimit` counted all properties/units regardless of `deleted_at`; queries now include `AND deleted_at IS NULL` so a landlord who deletes their property can immediately create a new one on the free plan
- **"No tenants yet" shown when accepted invitation exists** — the Tenants page empty state fired whenever `tenants.length === 0`, even when an accepted invitation was present (tenant accepted but no lease yet); now shows a contextual info banner instead: "Your tenant has accepted their invitation. Create a lease to activate their account."

---

## [1.4.0] — 2026-04-14 — Bug fixes & admin account management

### Added
- `scripts/update-admin.js` — update the email and/or password of an existing admin account directly against the production database; looks up by `OLD_EMAIL`, validates no email conflict, bcrypt-hashes the new password; all three fields (`OLD_EMAIL`, `NEW_EMAIL`, `NEW_PASSWORD`) are env-var driven with no hard-coded credentials

### Fixed
- **Dashboard infinite spinner for free-tier landlords** — analytics endpoint returns 402 for free accounts, leaving `data = undefined`; the previous `if (isLoading || !data)` guard caught this as a loading state forever; reordered to `if (isLoading)` → `if (isError)` so the upgrade prompt is shown immediately
- **"Rendered fewer hooks than expected" crash on Charges page** — `useCharges`, `useCreateCharge`, `useUpdateCharge`, `useVoidCharge`, and `useMemo` were declared after an early return that fires when a landlord has no properties, violating React's Rules of Hooks; all hook calls moved above the conditional return
- **Duplicate email registration shows generic error** — backend sends `{ error: '...' }` but `RegisterPage` was reading `data.message`; now reads `data.error` first so "Email already in use" is shown correctly
- **Password reset "Something went wrong"** — two fixes: (1) `ForgotPasswordPage` and `ResetPasswordPage` now read `data.error` before `data.message` so real backend errors surface; (2) SES call in `authService.forgotPassword` wrapped in try/catch — AWS delivery failures are now logged server-side and returned as a user-friendly 503 instead of a raw 500
- **"Failed to fetch dynamically imported module" crash after deployment** — Vite content-hashes every lazy-loaded page chunk; after a new deploy the old hashes no longer exist, causing `TypeError: Failed to fetch dynamically imported module` for users still holding a tab open; added `ChunkErrorBoundary` (class error boundary) that detects chunk-load errors and does a single `window.location.reload()` to fetch fresh HTML with the correct chunk URLs; a `sessionStorage` flag prevents infinite reload loops; applied to all lazy routes in `AdminRoutes.jsx` and `TenantRoutes.jsx`

---

## [1.3.0] — 2026-04-14 — QA polish, onboarding, landing page & email verification

### Added
- **Email verification** — new landlords must click an emailed link before accessing the dashboard
  - `migrations/024_email_verification.sql` — adds `email_verified_at`, `email_verify_token`, `email_verify_token_expires_at` to `users`; pre-verifies all existing users
  - `src/dal/emailVerificationRepository.js` — `setVerifyToken`, `findValidToken`, `markVerified`
  - `POST /api/v1/auth/verify-email` — validates token, stamps `email_verified_at`, returns a fresh token pair
  - `POST /api/v1/auth/resend-verification` — issues a fresh 24-hour token and resends the SES email
  - `emailVerified` claim baked into JWT by `signToken` — verification check is synchronous (no extra DB hit per request)
  - Global email gate middleware in `app.js` — all `/api/v1/*` routes (except `/auth/*`) return 403 `EMAIL_UNVERIFIED` for unverified landlords
  - `VerifyEmailPage` — click-through page at `/verify-email?token=...`; auto-fires on mount, shows spinner/success/error, auto-navigates on success
  - `VerifyEmailPendingPage` — "check your inbox" page with resend button and logout link
  - `ProtectedRoute` redirects unverified landlords to `/verify-email-pending`
  - `useRegister` redirects new landlords directly to `/verify-email-pending` after signup
- **Marketing landing page** at `/` — hero, feature cards, Free vs Pro pricing, sticky nav and footer; authenticated users are immediately redirected to `/dashboard`
- **Onboarding wizard** (`OnboardingWizard`) — 3-step MUI dialog for new landlords (features overview → Stripe Connect → add first property); localStorage-gated via `ll_onboarding_done`; shown on Dashboard once
- **Delete / archive property** — replaces hard-delete with a soft-delete cascade
  - `migrations/023_archive_properties_units.sql` — adds `deleted_at` to `properties` and `units`
  - `propertyRepository.cascadeArchive(id)` — terminates active/pending leases, soft-deletes units, soft-deletes property in three SQL statements
  - All queries in `propertyRepository`, `unitRepository`, and `analyticsRepository` now filter `WHERE deleted_at IS NULL`
  - `PropertyDetailPage` — "Delete" button in property card with two-step confirmation: (1) warning dialog, (2) type property name to unlock the archive button
- **UpgradePromptDialog** — reusable 402 handler shown when a free-tier landlord hits a plan limit; "Upgrade to Pro" CTA launches Stripe Checkout
- **Unit creation wizard** — after creating a multi-family or commercial property, a stepper dialog opens to bulk-create units (count ± stepper, optional prefix, live preview)
- **UnitPicker** auto-disables with hint text when no units exist
- **ChargesPage** redirects to Properties with an empty state when the landlord has no properties yet
- `create-admin.js` default email changed to `admin@lotlord.app`; only `ADMIN_PASSWORD` is required

### Changed
- Branding: "Property Manager" renamed to **LotLord** throughout `LoginPage`, `RegisterPage`, `AdminShell`, `TermsPage`
- `PropertyForm` field renamed from "Name" to **Property Nickname** with placeholder and helper text
- API URL resolution moved fully to runtime (`resolveApiBase()`) — `VITE_API_URL` build var no longer required; derives `api.{root}` from `window.location.hostname`
- `propertyService.deleteProperty` replaced hard-delete guard (409 if units exist) with `cascadeArchive`
- `userRepository.create` and `findById` now return `email_verified_at`

### Fixed
- `DashboardPage` crash on first load after registration — added `if (isLoading || !data)` guard (was `if (isLoading)` only)

---

## [1.2.0] — 2026-04-13 — Deployment, error alerting & auth hardening

### Added
- Railway deployment config (`railway.toml` for backend and `frontend/railway.toml`)
- `scripts/create-admin.js` — idempotent superadmin bootstrap; `npm run create-admin`
- `src/middleware/errorAlerter.js` — lightweight error monitoring via SES email on 5xx errors and unhandled process rejections; 10-minute per-error cooldown; no-ops in dev/test
- `ALERT_EMAIL` env var — recipient for error alert emails
- Tenant empty state on `/my/dashboard` — friendly card with navigation CTAs when no active lease exists
- Connect onboarding banner on `ProfilePage` — persistent warning for landlords who haven't completed Stripe Connect setup

### Fixed
- Auth cookie `sameSite: 'strict'` blocked refresh cookie cross-subdomain (`www.lotlord.app` → `api.lotlord.app`); changed to `sameSite: 'lax'` with `domain: '.lotlord.app'`
- Token refresh in `axios.js` used hardcoded relative URL `/api/v1/auth/refresh`; now resolves via `VITE_API_URL` for production cross-origin requests
- `phone` empty string from React Hook Form failed `isMobilePhone()` in express-validator v7; all four validators updated to `optional({ values: 'falsy' })`

---

## [1.1.0] — 2026-04-07 — Security audit, integration tests & maintenance/documents rework

### Added
- Integration test suite: 11 suites, 51 tests (`auth`, `properties`, `units`, `tenants`, `leases`, `charges`, `payments`, `maintenance`, `ledger`, `invitations`, `documents`)
- `src/lib/pagination.js` — `parsePagination()` utility; eliminates NaN offset on paginated queries; applied across all 12 DAL files
- `MaintenanceDetailDrawer` — full-detail drawer with photo grid, camera-ready upload (`capture="environment"`), lightbox, inline status/priority editing, file download and remove
- `DocumentsPage` — tabbed view (All / Properties / Tenants / Leases / Units / Unlinked), client-side search, upload dialog with entity-link pickers
- `StatusChip` — added `completed` and `cancelled` maintenance statuses
- `migrations/023_documents_extended_types.sql` — adds `'property'` to `documents.related_type`; adds `'photo'` and `'notice'` to `documents.category`

### Fixed
- 9 rounds of IDOR, multi-tenant data leak, and crash fixes across all API domains
- `middleware/auth.js` — `pool` was never imported; replaced with `query` from `../config/db`
- `app.js` — added `trust proxy 1` so `req.ip` reflects real client IP behind Railway's load balancer
- `controllers/authController.js` — exports `cookieOptions`/`COOKIE_NAME` so `invitationController.js` import resolves at runtime
- `dal/userRepository.js` — `findBillingStatus` now includes `AND deleted_at IS NULL`
- `MaintenancePage` — `onRowClick` receives `GridRowParams`; was using whole object instead of `params.row`

### Removed
- `IMPLEMENTATION-PLAN.md`, `Future-Changes.txt`, `MVP-CHECKLIST.md` — superseded by ROADMAP.md and CHANGELOG.md

---

## [1.0.0] — 2026-03-23 — MVP Release

### Added

#### Backend
- Node.js + Express API — layered architecture (Routes → Controllers → Services → DAL)
- 22 PostgreSQL migrations covering all tables
- Environment validation (`src/config/env.js`), connection pool (`src/config/db.js`), custom migration runner
- Scheduled cron jobs: rent reminders (daily 8am), late fees (daily 9am), lease expiry warnings (weekly)
- JWT auth — 15-minute access token (memory) + 30-day httpOnly refresh cookie; roles: `admin`, `landlord`, `tenant`
- Tenant invitation system — crypto-random tokens, email + SMS delivery, 7-day expiry, pre-filled signup form
- Full CRUD: properties, units, tenants, leases, charges, payments, maintenance requests, documents
- Append-only financial ledger with running balance; portfolio analytics endpoint
- Stripe ACH payments — setup intent, payment intent, webhook (`payment_intent.succeeded/failed`), duplicate-payment prevention
- Stripe Connect — landlord bank account onboarding and payout routing (0.8%, capped $5)
- Stripe Subscriptions — free vs pro tier; `requiresPro` middleware gates analytics and ACH
- AWS SES email (outbound + inbound webhook parsing), Twilio SMS (outbound + inbound webhook)
- Two-way messaging with notification templates, variable substitution, and per-tenant opt-in
- Audit log — append-only, all key actions instrumented, admin-only query endpoint
- Rate limiting — 20 req/15min on auth routes, 200 req/15min elsewhere
- Helmet security headers, CORS origin whitelist, Stripe webhook signature validation
- `GET /health` — DB connectivity check, version, uptime

#### Frontend
- React 19 + Vite 7 + MUI v6
- Admin portal — 14 pages: Dashboard, Properties, Property Detail, Tenants, Tenant Detail, Leases, Edit Lease, Ledger, Charges, Payments, Maintenance, Documents, Messages, Notification Templates, Audit Log, Users, Profile
- Tenant portal — 5 pages: Dashboard, Charges, Maintenance, Documents, Profile
- Responsive layout — hamburger drawer on mobile (admin), bottom navigation on mobile (tenant)
- TanStack Query v5, Zustand auth store, React Hook Form + Zod, Axios with silent 401 → refresh → retry
- Stripe Elements — `ConnectBankDialog` for ACH bank account setup
- Getting Started checklist on Dashboard — auto-hides when all setup steps complete
- Forgot password / reset password flow
- Terms of Service + Privacy Policy acceptance at registration and invitation acceptance

---

## Version History

| Version | Date | Summary |
|---|---|---|
| 1.4.1 | 2026-04-14 | QA patch: free-tier limit, property form UX & tenant portal polish |
| 1.4.0 | 2026-04-14 | Bug fixes & admin account management |
| 1.3.0 | 2026-04-14 | QA polish, onboarding, landing page & email verification |
| 1.2.0 | 2026-04-13 | Deployment, error alerting & auth hardening |
| 1.1.0 | 2026-04-07 | Security audit, integration tests & maintenance/documents rework |
| 1.0.0 | 2026-03-23 | MVP release |

---

[Unreleased]: https://github.com/DHomesy/lotlord/compare/v1.4.1...HEAD
[1.4.1]: https://github.com/DHomesy/lotlord/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/DHomesy/lotlord/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/DHomesy/lotlord/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/DHomesy/lotlord/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/DHomesy/lotlord/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/DHomesy/lotlord/releases/tag/v1.0.0
