import { loadConnectAndInitialize } from '@stripe/connect-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
let connectInstance = null

export function getStripeConnectInstance(fetchClientSecret) {
  if (!publishableKey) return null

  if (!connectInstance) {
    connectInstance = loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret,
      appearance: {
        overlays: 'dialog',
        variables: {
          colorPrimary: '#1976d2',
          colorText: '#1f2937',
          colorBackground: '#ffffff',
          borderRadius: '6px',
          fontFamily: 'inherit',
        },
      },
    })
  }

  return connectInstance
}

export function resetStripeConnectInstance() {
  connectInstance?.logout().catch(() => {})
  connectInstance = null
}