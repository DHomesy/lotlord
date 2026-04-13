# Property Manager — Frontend

React 19 + Vite 7 single-page application for the Property Manager platform.

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Build tool & dev server |
| MUI (Material UI) | v6 | Component library & theming |
| React Router | v6 | Client-side routing |
| TanStack Query | v5 | Server state, caching, background refetch |
| Zustand | v5 | Client-only state (auth token, user) |
| React Hook Form + Zod | — | Forms with schema validation |
| Axios | — | HTTP client with interceptors |
| Stripe.js | — | ACH payment element |
| Day.js | — | Date formatting |

---

## Running Locally

```bash
cd frontend
npm install
npm run dev       # starts on http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview production build
```

> The API is expected at `http://localhost:3000`. Set `VITE_API_URL` in a `.env.local` file to override.

---

## Folder Structure

```
frontend/src/
├── api/          # Axios instances and per-domain request helpers
├── assets/       # Static images / icons
├── components/   # Shared UI components (tables, modals, forms, layout)
├── hooks/        # Custom hooks (useAuth, usePagination, etc.)
├── lib/          # Utility functions (formatCurrency, formatDate, etc.)
├── pages/
│   ├── admin/    # Admin/landlord views (properties, units, tenants, leases, charges, …)
│   ├── auth/     # Login, register, forgot password, reset password
│   ├── legal/    # Terms of service, privacy policy
│   └── tenant/   # Tenant portal (dashboard, payments, maintenance, documents)
├── router/       # React Router route definitions and guards
├── store/        # Zustand stores (authStore)
└── theme/        # MUI theme overrides
```

---

## Auth Flow

1. `POST /auth/login` returns a short-lived JWT access token (stored in Zustand / memory) and sets an httpOnly refresh cookie.
2. The Axios instance in `src/api/` attaches the access token as `Authorization: Bearer <token>` on every request.
3. On 401 responses the interceptor calls `POST /auth/refresh` using the httpOnly cookie to get a new access token silently.
4. `router/` has a `<RequireAuth>` guard that checks the Zustand store; unauthenticated users are redirected to `/login`.
5. Role-based redirects: `admin`/`landlord` → `/admin/dashboard`; `tenant` → `/tenant/dashboard`.

---

## Adding a New Page

1. Create `src/pages/<role>/MyPage.jsx`
2. Add a route in `src/router/index.jsx` under the appropriate role guard
3. If it fetches data, create a query hook in `src/hooks/` using `useQuery` from TanStack Query
4. Add a nav link in the relevant sidebar component in `src/components/layout/`

---

## Adding a New Form

1. Define a Zod schema in the component file (or a shared `src/lib/schemas.js`)
2. Use `useForm({ resolver: zodResolver(schema) })` from React Hook Form
3. Wire `<Controller>` components to MUI inputs
4. On submit call the relevant API function from `src/api/`; invalidate the affected TanStack Query key on success
