# Changelog

All notable changes are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
| 1.4.0 | 2026-04-14 | Bug fixes & admin account management |
| 1.3.0 | 2026-04-14 | QA polish, onboarding, landing page & email verification |
| 1.2.0 | 2026-04-13 | Deployment, error alerting & auth hardening |
| 1.1.0 | 2026-04-07 | Security audit, integration tests & maintenance/documents rework |
| 1.0.0 | 2026-03-23 | MVP release |

---

[Unreleased]: https://github.com/DHomesy/lotlord/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/DHomesy/lotlord/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/DHomesy/lotlord/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/DHomesy/lotlord/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/DHomesy/lotlord/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/DHomesy/lotlord/releases/tag/v1.0.0
