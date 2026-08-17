export default defineNuxtConfig({
  vite: {
    optimizeDeps: {
      // The contacts page renders the insights chart eagerly, so apexcharts is
      // on the first paint of the default view. Left for Vite to discover on
      // first navigation, it re-optimizes mid-session and full-reloads — which
      // drops whatever navigation was in flight. A developer sees a flicker; an
      // automated run sees a page that never paints.
      include: ['apexcharts', 'vue3-apexcharts']
    }
  }
})
