import http from '../lib/axios'

const base = '/supervisor/conversations'
const unmatchedBase = '/supervisor/unmatched-inbound'

export const getSupervisorConversations = (params) => http.get(base, { params }).then((r) => r.data)
export const supervisorOverride         = (id, data) => http.post(`${base}/${id}/override`, data).then((r) => r.data)
export const supervisorUpdate           = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const getUnmatchedInboundQueue   = (params) => http.get(unmatchedBase, { params }).then((r) => r.data)
export const updateUnmatchedInbound     = (id, data) => http.patch(`${unmatchedBase}/${id}`, data).then((r) => r.data)
