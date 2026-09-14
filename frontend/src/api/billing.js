import http from '../lib/axios'

const base = '/billing'

export const getMySubscription          = ()  => http.get(`${base}/status`).then((r) => r.data)
export const createCheckoutSession      = (plan) => http.post(`${base}/checkout`, { plan }).then((r) => r.data)
export const createEmbeddedCheckoutSession = () => http.post(`${base}/checkout/embedded`).then((r) => r.data)
export const createBillingSetupIntent   = ()  => http.post(`${base}/payment-method/setup`).then((r) => r.data)
export const completeBillingPaymentMethod = (setupIntentId) => http.post(`${base}/payment-method/complete`, { setupIntentId }).then((r) => r.data)
export const cancelSubscription         = ()  => http.post(`${base}/cancel`).then((r) => r.data)
export const reactivateSubscription     = ()  => http.post(`${base}/reactivate`).then((r) => r.data)
export const createBillingPortalSession = ()  => http.post(`${base}/portal`).then((r) => r.data)
export const getLandlordSubscriptions   = ()  => http.get(`${base}/admin/landlords`).then((r) => r.data)
