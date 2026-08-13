// Playwright config. Self-starts a Nuxt server on TEST_BASE_URL pointed at
// the test DB so browser tests don't pollute the dev DB. Vitest runs API
// tests on its own nuxt-test-utils server (different port); the two suites
// can run side by side.
import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = loadEnv('test', process.cwd(), '')
const baseURL = env.TEST_BASE_URL || 'http://localhost:2090'
const port = new URL(baseURL).port || '2090'

export default defineConfig({
  testDir: resolve(__dirname, '../tests/e2e'),
  outputDir: resolve(__dirname, '../tests/e2e/.results'),
  // Tests share one Postgres DB + one Mailpit inbox. Parallel workers race
  // on Mailpit (test A's clearMailhog wipes test B's pending message) and
  // on host-prefixed seeds. Serial runs are slower (~1m vs ~30s) but
  // deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // No retries anywhere: a test that only passes on the second attempt is
  // failing, and retrying hides which one. CI gets `list` for readable logs
  // plus `html` so the uploaded playwright-report artifact actually has
  // something in it.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  globalSetup: resolve(__dirname, '../tests/e2e/global-setup.ts'),
  globalTeardown: resolve(__dirname, '../tests/e2e/global-teardown.ts'),
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `bun nuxt dev --port ${port}`,
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: env.TEST_DATABASE_URL!,
      APP_DATABASE_URL: env.TEST_APP_DATABASE_URL!,
      JWT_SECRET: env.JWT_SECRET!,
      NUXT_PUBLIC_SITE_URL: baseURL,
      NODE_ENV: 'development'
    }
  }
})
