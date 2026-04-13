# Changelog

All notable changes are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
| 1.2.0 | 2026-04-13 | Deployment, error alerting & auth hardening |
| 1.1.0 | 2026-04-07 | Security audit, integration tests & maintenance/documents rework |
| 1.0.0 | 2026-03-23 | MVP release |

---

[Unreleased]: https://github.com/DHomesy/lotlord/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/DHomesy/lotlord/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/DHomesy/lotlord/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/DHomesy/lotlord/releases/tag/v1.0.0
