import http from '../lib/axios'
const base = '/payments'

export const getPayments                = (params)    => http.get(base, { params }).then((r) => r.data)
export const createPaymentIntent        = (data)      => http.post(`${base}/stripe/payment-intent`, data).then((r) => r.data)
// Tenant self-service: pay their own charge (lease resolved server-side)
export const createMyPaymentIntent      = (data)      => http.post(`${base}/stripe/payment-intent/me`, data).then((r) => r.data)

// GET /payments/:id/receipt — returns a PDF blob
export const getReceipt = (id) =>
  http.get(`${base}/${id}/receipt`, { responseType: 'blob' }).then((r) => r.data)

// ── Stripe ACH setup ──────────────────────────────────────────────────────────
// Admin creates a SetupIntent on behalf of a specific tenant
export const createSetupIntent          = (tenantId)  => http.post(`${base}/stripe/setup-intent`, { tenantId }).then((r) => r.data)
// Tenant creates a SetupIntent for their own account (no tenantId needed — resolved from JWT)
export const createMySetupIntent        = ()          => http.post(`${base}/stripe/setup-intent/me`).then((r) => r.data)
// Admin lists a specific tenant's saved bank accounts
export const getPaymentMethods          = (tenantId)  => http.get(`${base}/stripe/payment-methods/${tenantId}`).then((r) => r.data)
// Tenant lists their own saved bank accounts
export const getMyPaymentMethods        = ()          => http.get(`${base}/stripe/payment-methods/me`).then((r) => r.data)

// ── Stripe Connect (landlord/admin payout setup) ───────────────────────────
export const createConnectOnboardingLink = ()         => http.post(`${base}/connect/onboard`).then((r) => r.data)
export const createConnectLoginLink      = ()         => http.post(`${base}/connect/login`).then((r) => r.data)
export const getConnectStatus            = ()         => http.get(`${base}/connect/status`).then((r) => r.data)

