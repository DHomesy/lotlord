import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/properties'

export const PROPERTIES_KEY = ['properties']

export function useProperties(params) {
  return useQuery({
    queryKey: [...PROPERTIES_KEY, params],
    queryFn: () => api.getProperties(params),
  })
}

export function useProperty(id) {
  return useQuery({
    queryKey: [...PROPERTIES_KEY, id],
    queryFn: () => api.getProperty(id),
    enabled: !!id,
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createProperty,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROPERTIES_KEY }),
  })
}

export function useUpdateProperty(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateProperty(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROPERTIES_KEY }),
  })
}

export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteProperty,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROPERTIES_KEY }),
  })
}
