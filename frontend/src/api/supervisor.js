import http from '../lib/axios'

const base = '/supervisor/conversations'

export const getSupervisorConversations = (params) => http.get(base, { params }).then((r) => r.data)
export const supervisorOverride         = (id, data) => http.post(`${base}/${id}/override`, data).then((r) => r.data)
export const supervisorUpdate           = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
