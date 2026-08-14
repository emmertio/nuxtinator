// Playwright global setup. The webServer entry in playwright.config.ts boots
// Nuxt against the test DB; this hook clears prior test data so a stale run
// doesn't pollute the next one, resets the mail inbox, and warms the server.
import { chromium, type FullConfig } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getHostAdminDb,
  closeTestDatabases,
  cleanupCoreTestData,
  clearMailhog
} from '@nuxtinator/core/test-helpers'
import { cleanupTenancyTestData } from '@nuxtinator/tenancy/test-helpers'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: resolve(__dirname, '../../dev/.env') })

// The server under test is `nuxt dev`. Its first browser visit compiles the
// app entry and lets Vite discover dependencies it hasn't pre-bundled, which
// ends in a full page reload — and a reload discards whatever navigation was
// in flight. Whichever spec ran first therefore paid the cost and flaked,
// which is not a fact about that spec.
//
// Playwright starts webServer before this hook, so one real browser visit here
// absorbs the cold start for the whole run. It has to be a browser: fetching
// the URL returns the shell without ever pulling the module graph, so it warms
// nothing.
async function warmServer(baseURL: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(new URL('/login', baseURL).href, {
      waitUntil: 'networkidle',
      timeout: 120_000
    })
  } finally {
    await browser.close()
  }
}

export default async function globalSetup(config: FullConfig) {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set in dev/.env')
  }
  const sql = getHostAdminDb()
  await cleanupTenancyTestData(sql)
  await cleanupCoreTestData(sql)
  try {
    await clearMailhog()
  } catch {
    // not strictly required
  }
  await closeTestDatabases()

  const baseURL = config.projects[0]?.use.baseURL
  if (baseURL) await warmServer(baseURL)
}
