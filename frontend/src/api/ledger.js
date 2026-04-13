import http from '../lib/axios'
const base = '/ledger'

export const getLedger = (params) => http.get(base, { params }).then((r) => r.data)
export const getLedgerEntry = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const getPortfolioSummary = (params) => http.get(`${base}/portfolio`, { params }).then((r) => r.data)
