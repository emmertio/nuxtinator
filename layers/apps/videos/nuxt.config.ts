export default defineNuxtConfig({
  vite: {
    optimizeDeps: {
      // Heavy CJS deps that the upload and record pages import eagerly. Left
      // for Vite to discover on first navigation, it re-optimizes mid-session
      // and full-reloads — which drops whatever navigation was in flight. A
      // developer sees a flicker; an automated run sees a route that never
      // arrives. Pre-bundling at boot costs a few seconds once.
      include: ['mediabunny', 'fix-webm-duration']
    }
  }
})
