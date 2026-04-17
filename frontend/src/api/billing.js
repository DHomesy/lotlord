import http from '../lib/axios'

const base = '/billing'

export const getMySubscription          = ()  => http.get(`${base}/status`).then((r) => r.data)
export const createCheckoutSession      = (plan) => http.post(`${base}/checkout`, { plan }).then((r) => r.data)
export const createBillingPortalSession = ()  => http.post(`${base}/portal`).then((r) => r.data)
export const getLandlordSubscriptions   = ()  => http.get(`${base}/admin/landlords`).then((r) => r.data)
