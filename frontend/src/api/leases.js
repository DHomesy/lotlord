import http from '../lib/axios'
const base = '/leases'

export const getLeases     = (params) => http.get(base, { params }).then((r) => r.data)
export const getLease      = (id)     => http.get(`${base}/${id}`).then((r) => r.data)
export const createLease   = (data)   => http.post(base, data).then((r) => r.data)
export const updateLease   = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const terminateLease = (id)    => http.post(`${base}/${id}/terminate`).then((r) => r.data)

// ── Co-tenants ────────────────────────────────────────────────────────────────
// Co-tenants share portal access with the primary tenant on a lease.
// Max 5 co-tenants per lease (enforced server-side).

/** Fetch the list of co-tenants for a given lease. */
export const getCoTenants  = (leaseId)              => http.get(`${base}/${leaseId}/co-tenants`).then((r) => r.data)
/** Add a tenant as a co-tenant. Resolves to the new lease_co_tenants row. */
export const addCoTenant   = ({ leaseId, tenantId }) => http.post(`${base}/${leaseId}/co-tenants`, { tenantId }).then((r) => r.data)
/** Remove a co-tenant from a lease. */
export const removeCoTenant = ({ leaseId, tenantId }) => http.delete(`${base}/${leaseId}/co-tenants/${tenantId}`).then((r) => r.data)
