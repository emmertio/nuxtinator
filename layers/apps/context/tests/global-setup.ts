// Vitest global setup for the `context` project. Mirrors messages' setup:
// boot Nuxt with the test DB env, wipe any context-prefixed leftovers on
// entry/exit. Also turns on the fake Anthropic client (via
// CONTEXT_TEST_ANTHROPIC=1) so assistant tests don't make real API calls.
import { createTest, exposeContextToEnv } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  getHostAdminDb,
  waitForMigrations,
  closeTestDatabases,
  cleanupContextTestData,
  cleanupTenancyTestData,
  cleanupCoreTestData,
  clearMailhog
} from './helpers'

const HOST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../dev')

// NODE_ENV='development' at build + run time so the email layer routes to
// Mailpit (see core's global-setup.ts for the why).
const hooks = createTest({
  rootDir: HOST_DIR,
  server: true,
  browser: false,
  env: {
    NODE_ENV: 'development',
    // Activates the context layer's fake Anthropic plugin so the assistant
    // routes don't call the real API during tests.
    CONTEXT_TEST_ANTHROPIC: '1'
  },
  nuxtConfig: {
    vite: {
      define: {
        'process.env.NODE_ENV': JSON.stringify('development')
      }
    },
    nitro: {
      replace: {
        'process.env.NODE_ENV': JSON.stringify('development')
      }
    }
  }
})

export async function setup() {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL and TEST_APP_DATABASE_URL must be set in dev/.env. Run scripts/setup-test-db.sh.'
    )
  }

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL
  process.env.NODE_ENV = 'development'
  // Mirror it for this process — the createTest call above already forwards
  // it to the spawned Nuxt subprocess.
  process.env.CONTEXT_TEST_ANTHROPIC = '1'

  await hooks.beforeAll()
  exposeContextToEnv()

  // Boot migrations run detached from the listener — hold here until they land.
  await waitForMigrations()

  const admin = getHostAdminDb()
  await cleanupContextTestData(admin)
  await cleanupTenancyTestData(admin)
  await cleanupCoreTestData(admin)

  try {
    await clearMailhog()
  } catch {
    // not required for every test
  }
}

export async function teardown() {
  try {
    const admin = getHostAdminDb()
    await cleanupContextTestData(admin)
  } finally {
    await closeTestDatabases()
    await hooks.afterAll()
  }
}
