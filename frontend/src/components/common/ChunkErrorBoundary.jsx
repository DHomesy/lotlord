import { Component } from 'react'

/**
 * Error boundary specifically for Vite/React lazy-chunk load failures.
 *
 * After a new deployment the content-hashed JS filenames change. Any user
 * still holding a tab open with the old HTML will try to fetch the old chunk
 * URLs, which no longer exist on the CDN/server → "Failed to fetch dynamically
 * imported module". This boundary catches that error and does a single hard
 * reload so the browser fetches the fresh HTML and the new chunk URLs.
 */
export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { errored: false }
  }

  static getDerivedStateFromError(error) {
    const msg = error?.message ?? ''
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('ChunkLoadError') ||
      error?.name === 'ChunkLoadError'

    if (isChunkError) {
      // Guard against infinite reload loops — only reload once per session.
      const reloadKey = 'll_chunk_reload'
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1')
        window.location.reload()
      }
    }

    return { errored: true }
  }

  render() {
    // After the reload the component tree re-mounts clean. If somehow the
    // reload didn't help (or a non-chunk error occurred), fall through to
    // children — the Suspense fallback / next error boundary will handle it.
    if (this.state.errored) return null
    return this.props.children
  }
}
