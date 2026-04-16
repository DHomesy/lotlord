# Changelog

All notable changes are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
