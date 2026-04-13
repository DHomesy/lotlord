# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html):  
`MAJOR.MINOR.PATCH` — breaking change / new feature / bug fix.

---

## [Unreleased]

> Staged work not yet cut into a release.

---

## [1.1.0] — 2026-04-07 — Security audit, integration tests & repo cleanup

### Added
- Integration test suite: 11 suites, 51 tests across all major API domains (`auth`, `properties`, `units`, `tenants`, `leases`, `charges`, `payments`, `maintenance`, `ledger`, `invitations`, `documents`)
- `src/lib/pagination.js` — `parsePagination()` utility; eliminates NaN offset when query params are strings; applied to all 12 DAL files

### Fixed
- `middleware/auth.js` — `pool` was never imported, causing `ReferenceError` in `checkFreeTierLimit`; replaced with `query` from `../config/db`
- `app.js` — added `trust proxy 1` so `req.ip` and the rate limiter see the real client IP behind a load balancer
- `services/stripeService.js` — removed hardcoded `'0.0.0.0'` in ACH mandate `ip_address`; now uses the `ipAddress` param resolved from `req.ip`
- `controllers/paymentController.js` — both admin and tenant payment-intent paths now pass `ipAddress: req.ip` to Stripe
- `dal/documentRepository.js` — `findByIdForTenant` was more permissive than `findAll`; unified to `uploaded_by` check (IDOR fix)
- `services/notificationService.js` — added `escapeHtml()` and channel-aware `renderTemplate`; all user-controlled values in email templates are HTML-escaped
- `controllers/tenantController.js` — removed inline `require()` calls that shadowed top-level imports and re-required on every request
- `routes/payments.js` — added `authorize('tenant')` to all three `/me` routes
- `routes/tenants.js` — added `authorize('tenant')` to `GET /me` (previously a landlord received a confusing 404)
- `controllers/authController.js` — exports `cookieOptions`/`COOKIE_NAME` so the existing import in `invitationController.js` resolves at runtime
- `dal/userRepository.js` — `findBillingStatus` now includes `AND deleted_at IS NULL`

### Removed
- `IMPLEMENTATION-PLAN.md`, `Future-Changes.txt`, `MVP-CHECKLIST.md` — stale planning docs; superseded by ROADMAP.md and CHANGELOG.md

---

## [1.0.0] — 2026-03-23 — MVP Release

### Added

#### Foundation
- Node.js + Express API server with layered architecture (Routes → Controllers → Services → DAL)
- 20 PostgreSQL migrations covering all tables (`users`, `properties`, `units`, `tenants`, `leases`, `rent_charges`, `rent_payments`, `ledger_entries`, `maintenance_requests`, `maintenance_attachments`, `documents`, `notification_templates`, `notifications_log`, `ai_conversations`, `ai_messages`, `tenant_invitations`, `audit_log`)
- Environment validation via `src/config/env.js`; connection pool via `src/config/db.js`
- Dev seed (`npm run seed`) — creates admin, landlord, and tenant test accounts with a full property/unit/lease/charge dataset
- Scheduled jobs: rent reminders, late fee application, lease expiry warnings (node-cron)

#### Authentication & Users
- `POST /auth/register` — role-selection at signup (`landlord` or `tenant`); tenant self-signup auto-creates a `tenants` row
- `POST /auth/login` / `POST /auth/refresh` — JWT access token (15 min, JS memory) + httpOnly refresh cookie (30 days)
- `PATCH /users/:id` / `PATCH /users/me` — profile update (name, phone, avatar)
- `POST /users/me/password` — password change (bcrypt, requires current password)
- Three roles: `admin` (full access), `landlord` (scoped to own properties), `tenant` (scoped to own lease)

#### Tenant Invitation System
- Crypto-random invite tokens; `POST /invitations` → sends email + SMS with signup link
- Public `GET /invitations/:token` pre-fills name/email/unit; `POST /invitations/:token/accept` auto-creates user + tenant, returns JWT
- Admin `TenantsPage` shows pending invitations table with status chips

#### Properties & Units
- Full CRUD for properties and units with role guards (admin/landlord)
- Unit status lifecycle: `vacant` → `occupied` (lease creation) → `vacant` (lease termination / expiry); `maintenance` blocks lease creation
- `PropertyDetailPage` — per-unit Edit, vacancy summary chips, `sq_ft` column

#### Tenant & Lease Management
- Full CRUD for tenants and leases
- Lease creation auto-marks unit occupied and appends deposit `ledger_entries` row
- Lease termination frees the unit and appends a credit entry if deposit unreturned
- `LeasesPage` — Active/Archived toggle; archived count badge
- `EditLeasePage` — generates missing monthly rent charges; skips months that already exist (no duplicates)
- Smart pickers: `UnitPicker`, `TenantPicker`, `LeasePicker` — searchable MUI Autocomplete components (no more raw UUID inputs)

#### Financial Ledger
- Append-only `ledger_entries` — source of truth for running tenant balance
- `GET /ledger?leaseId=` — full journal with `balance_after` and actor name
- `GET /ledger/portfolio` — income statement (admin sees all; landlord scoped to own properties)
- `LedgerPage` — requires lease selection; current-balance chip with colour coding

#### Charges
- `GET /charges` — filterable by `leaseId`, `unitId`, `tenantId`, `propertyId`; computed `status` field: `voided` | `paid` | `pending` | `unpaid`
- Charge status uses a `LATERAL` join to prioritise `completed` over `pending` payments — prevents double-payment display
- `POST /charges/:id/void` — soft-delete; appends a `credit` ledger entry if lease-linked; blocks void if a completed payment exists
- Tenant `ChargesPage` — Outstanding/All tabs; Pay button hidden for non-`unpaid` charges

#### Stripe ACH Payments
- `POST /payments/stripe/setup-intent` / `setup-intent/me` — bank account onboarding (Financial Connections)
- `POST /payments/stripe/payment-intent` / `payment-intent/me` — charge a saved bank account (0.8%, capped at $5)
- `GET /payments/stripe/payment-methods/me` — tenant lists own saved bank accounts
- Duplicate payment prevention: `createMyPaymentIntent` returns HTTP 409 if a pending or completed payment already exists for the charge
- Stripe webhook (`payment_intent.succeeded` / `payment_intent.payment_failed`) — updates `rent_payments.status` and appends `ledger_entries`
- `ConnectBankDialog` — Stripe Elements + `<PaymentElement>` (`us_bank_account`); Begin → connect → Success flow

#### Manual Payments
- `POST /payments` — admin records cash/check payment; appends ledger entry

#### Maintenance
- Full CRUD for maintenance requests; `assigned_to` staff/contractor field
- Tenant maintenance photo uploads — up to 5 files (20 MB each); `capture="environment"` for mobile rear camera; two-step submit (create → parallel upload)
- Admin attachment upload via Google Drive

#### Documents
- `GET/POST/DELETE /documents` — polymorphic (lease, unit, maintenance, tenant); Google Drive storage

#### Email & SMS Notifications
- Gmail API outbound (`sendEmail`, `sendAllChannels`)
- Twilio SMS outbound (`sendSmsAdhoc`); inbound webhook with signature verification
- Gmail Push inbound (Google Cloud Pub/Sub → `POST /webhooks/gmail`); `gmailWatch` daily renewal job
- Notification templates — full CRUD UI; variable picker with descriptions; RHF Controller selects (no stale-value bug)

#### Unified Messaging
- Conversation view (`GET/POST /notifications/messages`, `GET /notifications/messages/:tenantId`)
- `MessagesPage` — split-pane conversation list + thread view + compose form (collapses to single-view on mobile)
- New Message button + `NewConversationDialog` + `TenantPicker` for starting first contact
- Tenant opt-in (`email_opt_in`, `sms_opt_in`) — set at invite acceptance; `sendMessage` gated on opt-in; warning shown in compose area if opted out

#### Analytics
- `GET /analytics/dashboard` — monthly income, unpaid dues, occupancy rate, last 5 payments, last 5 open maintenance requests
- `DashboardPage` — 4 stat cards (Monthly Income, Unpaid Dues, Occupancy Rate, Open Maintenance) + two Recent Activity tables

#### Audit Log
- `audit_log` table (migration 020) — append-only; `user_id`, `action`, `resource_type`, `resource_id`, `metadata` JSONB, `ip_address`
- Fire-and-forget `auditService.log()` — errors swallowed so audit never crashes the primary request
- Instrumented: `user_registered`, `user_login`, `charge_created`, `charge_voided`, `payment_initiated`, `payment_succeeded`, `payment_failed`, `payment_manual_created`, `lease_created`, `lease_terminated`, `lease_status_changed`, `maintenance_request_created`
- `GET /api/v1/audit` — admin-only; filterable by `resourceType`, `action`, `userId`, `resourceId`, `startDate`, `endDate`, `page`, `limit`
- `AuditLogPage` — filter bar + DataTable + MetadataDialog (full JSON)

#### Admin Portal (React SPA)
- 14 pages: Dashboard, Properties, Property Detail, Tenants, Tenant Detail, Leases, Edit Lease, Ledger, Charges, Payments, Maintenance, Documents, Messages, Notification Templates, Audit Log, Users, Profile
- `AdminShell` — permanent sidebar on desktop; hamburger drawer on mobile
- `Sidebar` — role-aware nav entries (admin-only: Audit Log)
- `AdminProfilePage` — edit name/phone, change password, connect bank account (ACH receive)

#### Tenant Portal (React SPA)
- 5 pages: Dashboard, Charges, Maintenance, Documents, Profile
- `TenantShell` — scrollable tab bar (sm+); `BottomNavigation` on mobile (xs)
- `TenantProfilePage` — profile edit, password change, bank account (ACH) connection (Billing section)
- `ChargesPage` — Outstanding/All charge tabs + Payment History; duplicate-payment-safe Pay button

#### Infrastructure & DX
- Vite 7 dev proxy (`/api/v1/*` → Express) — no CORS config in development
- TanStack Query v5 — one hook file per domain; `queryClient` invalidation after mutations
- Zustand auth store — `{ user, token, setAuth, clearAuth }`
- Axios instance — Bearer token injection + silent 401 → refresh → retry interceptor
- React Hook Form + Zod — all create/edit dialogs
- `<Bootstrap>` silent-refresh gate — no flash of login screen on reload
- `<ProtectedRoute>` — role-based access guard with `allowedRoles` array
- `StatusChip`, `DataTable`, `ConfirmDialog`, `LoadingOverlay`, `ErrorBoundary`, `PageContainer` shared components
- `/health` endpoint — `{ status, version, env }`

### Fixed (pre-1.0.0 issues resolved during development)
- Tenant creation `userId` error — handled via invitation flow
- `$NaN` amounts in payments and leases tables — number formatting corrected
- Maintenance form `unitId` / `category` validation errors as tenant
- Maintenance list showed raw UUID — now shows property address + unit number
- `MessagesPage` empty on first use — added New Message button + `NewConversationDialog`
- Template dialog showed stale form on reopen — `key` prop forces RHF remount
- Template selects submitted wrong value — replaced with RHF `Controller`
- Lease edit generated duplicate charges — now computes missing months only
- Ledger page showed nothing — added `LeasePicker` requirement; corrected column field names
- Tenant mobile nav didn't collapse — `BottomNavigation` on xs, scrollable tabs on sm+
- `PropertyDetailPage` crash on unit click — `useMemo` called after early return (Rules of Hooks); moved above return
- Tenant charges page showed nothing — default tab changed from Outstanding to All
- Admin mobile horizontal scroll — `DataTable` wrapped in `overflowX: auto`; `AdminShell` gains `minWidth: 0`

---

## Version History

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026-03-23 | Initial MVP release |

---

[Unreleased]: https://github.com/your-org/property-manager/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/property-manager/releases/tag/v1.0.0
