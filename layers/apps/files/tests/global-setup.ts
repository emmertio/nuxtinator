// Vitest global setup for the `files` project. Boots Nuxt (the dev/ host) with
// the test DB env, cleans any files-prefixed leftovers on entry/exit.
import { createTest, exposeContextToEnv } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  getHostAdminDb,
  waitForMigrations,
  closeTestDatabases,
  cleanupTenancyTestData,
  cleanupCoreTestData
} from './helpers'
import { cleanupFilesTestData } from './helpers'

// dev/ is the host. layers/apps/files/tests/global-setup.ts → ../../../../dev
const HOST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../dev')

const hooks = createTest({
  rootDir: HOST_DIR,
  server: true,
  browser: false,
  env: { NODE_ENV: 'development' },
  nuxtConfig: {
    vite: { define: { 'process.env.NODE_ENV': JSON.stringify('development') } },
    nitro: { replace: { 'process.env.NODE_ENV': JSON.stringify('development') } }
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

  await hooks.beforeAll()
  exposeContextToEnv()

  // Boot migrations run detached from the listener — hold here until they land.
  await waitForMigrations()

  const admin = getHostAdminDb()
  await cleanupFilesTestData(admin)
  await cleanupTenancyTestData(admin)
  await cleanupCoreTestData(admin)
}

export async function teardown() {
  try {
    const admin = getHostAdminDb()
    await cleanupFilesTestData(admin)
  } finally {
    await closeTestDatabases()
    await hooks.afterAll()
  }
}
