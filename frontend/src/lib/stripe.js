import { loadStripe } from '@stripe/stripe-js'

/**
 * Singleton Stripe.js promise.
 * Set VITE_STRIPE_PUBLISHABLE_KEY in your .env file (pk_test_... or pk_live_...).
 */
export const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null
