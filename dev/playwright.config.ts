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
  // The server under test runs `nuxt dev`, which compiles each route the first
  // time it's visited. On a warm local machine that lands inside Playwright's
  // 5s default; on a CI runner the first assertion after a `goto` regularly
  // does not. These are deadlines for a known-slow operation, not slack for a
  // flaky one — a test that needs more than this is telling you something.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    navigationTimeout: 30_000,
    // Traces are the only artifact that explains a CI-only failure, and with
    // retries off there is no second attempt to capture one on.
    trace: 'retain-on-failure'
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
