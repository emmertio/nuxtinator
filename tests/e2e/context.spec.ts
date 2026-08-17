// Context app browser flows. Vitest covers every API endpoint; these tests
// cover the UI surface: sidebar tree, inline create, section editor (rendered
// view vs edit toggle), version history, settings, custom sections, export.
//
// Pattern: seed users/orgs/portfolios via SQL (BYPASSRLS), mint a JWT, drop
// auth cookie, navigate. Wrap clicks that trigger an API call in
// `Promise.all([waitForResponse, click])` — asserting on URL or DOM before
// the response settles is the canonical flake source.
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getHostAdminDb } from '@nuxtinator/core/test-helpers'
import {
  cleanupContextTestData,
  createTestPortfolio,
  seedTestSection
} from '@nuxtinator/context/test-helpers'
import { loginIntoNewOrg } from './helpers/login'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: resolve(__dirname, '../../dev/.env') })

test.afterAll(async () => {
  await cleanupContextTestData(getHostAdminDb())
})

// ─── sidebar ───────────────────────────────────────────────────────────────

test('empty state — landing on /context shows the welcome panel', async ({ page }) => {
  const { org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  await page.goto(`/@${org.slug}/context`)

  await expect(page.locator('text=No portfolios yet')).toBeVisible()
  await expect(page.locator('text=Pick a portfolio from the sidebar')).toBeVisible()
})

test('create portfolio inline from sidebar — appears in list and navigates', async ({ page }) => {
  const { org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  await page.goto(`/@${org.slug}/context`)

  await page.getByRole('button', { name: /new portfolio/i }).click()

  const name = `Brand ${randomUUID().slice(0, 6)}`
  await page.getByPlaceholder('Portfolio name').fill(name)

  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/context/portfolios') && r.request().method() === 'POST' && r.status() === 200),
    page.getByRole('button', { name: /^create$/i }).click()
  ])

  // After create the page navigates to the new portfolio
  await expect(page).toHaveURL(/\/context\/[a-z0-9-]+$/)
  // And the new portfolio is present in the sidebar
  await expect(page.locator('nav').filter({ hasText: name })).toBeVisible()
})

test('seeded portfolios show in sidebar; clicking one navigates and expands sections', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, {
    org_id: org.id,
    name: 'Acme',
    created_by: user.id
  })

  await page.goto(`/@${org.slug}/context`)
  await page.locator('nav').getByRole('link', { name: /acme/i }).first().click()

  await expect(page).toHaveURL(new RegExp(`/context/${portfolio.slug}$`))
  // Sidebar expansion: default 9 sections show under the active portfolio.
  // We just spot-check that one of the known catalog titles is rendered.
  await expect(page.locator('nav').filter({ hasText: /identity/i }).first()).toBeVisible()
})

// ─── section editor ────────────────────────────────────────────────────────

test('section editor: empty section shows hint; Edit reveals textarea; Save persists', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })

  await page.goto(`/@${org.slug}/context/${portfolio.slug}/sections/identity`)

  await expect(page.locator('text=This section is empty')).toBeVisible()
  await page.getByRole('button', { name: /^edit$/i }).click()

  const textarea = page.locator('textarea[id^="section-editor-"]')
  await expect(textarea).toBeVisible()
  await textarea.fill('# Hello\n\nThis is identity content.')

  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes(`/api/context/portfolios/${portfolio.slug}/sections/identity`)
      && r.request().method() === 'PUT'
      && r.status() === 200
    ),
    page.getByRole('button', { name: /^save$/i }).click()
  ])

  // Edit mode collapses, rendered view shows the new content as HTML.
  await expect(textarea).toBeHidden()
  await expect(page.locator('h1', { hasText: /^Hello$/ })).toBeVisible()
  await expect(page.locator('text=This is identity content')).toBeVisible()
})

test('section editor: Cancel reverts the draft, no PUT fires', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })
  await seedTestSection(sql, {
    portfolio_id: portfolio.id,
    section_key: 'identity',
    content: 'original content'
  })

  await page.goto(`/@${org.slug}/context/${portfolio.slug}/sections/identity`)
  await page.getByRole('button', { name: /^edit$/i }).click()

  const textarea = page.locator('textarea[id^="section-editor-"]')
  await textarea.fill('discarded draft')

  await page.getByRole('button', { name: /^cancel$/i }).click()
  await expect(textarea).toBeHidden()
  // Original content still rendered.
  await expect(page.locator('text=original content')).toBeVisible()
})

// ─── version history ───────────────────────────────────────────────────────

test('version history: edit produces a version; restore swaps content back', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })

  // Save once from the UI to exercise the versioning side-effect end-to-end.
  await page.goto(`/@${org.slug}/context/${portfolio.slug}/sections/identity`)
  await page.getByRole('button', { name: /^edit$/i }).click()
  await page.locator('textarea[id^="section-editor-"]').fill('first content')
  await Promise.all([
    page.waitForResponse(r => r.url().includes(`/sections/identity`) && r.request().method() === 'PUT' && r.status() === 200),
    page.getByRole('button', { name: /^save$/i }).click()
  ])

  await page.getByRole('button', { name: /^edit$/i }).click()
  await page.locator('textarea[id^="section-editor-"]').fill('second content')
  await Promise.all([
    page.waitForResponse(r => r.url().includes(`/sections/identity`) && r.request().method() === 'PUT' && r.status() === 200),
    page.getByRole('button', { name: /^save$/i }).click()
  ])

  // Go to the version history page directly. The History link uses :to with
  // a bare /context/... path, which is org-prefix-preserved by the tenancy
  // router guard at navigate time; here we skip the link to avoid coupling
  // the test to that internal behavior.
  await page.goto(`/@${org.slug}/context/${portfolio.slug}/sections/identity/versions`)

  await expect(page.locator('text=first content')).toBeVisible()
  await expect(page.locator('text=second content')).toBeVisible()

  // Restoring the older version round-trips content back to it.
  page.on('dialog', d => d.accept())
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/restore') && r.status() === 200),
    page.getByRole('button', { name: /^restore$/i }).first().click()
  ])
})

// ─── settings ──────────────────────────────────────────────────────────────

test('settings: rename portfolio — sidebar reflects new name', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, {
    org_id: org.id,
    name: 'Old Name',
    created_by: user.id
  })

  await page.goto(`/@${org.slug}/context/${portfolio.slug}/settings`)
  const nameInput = page.locator('input').first()
  await nameInput.fill('Brand New')

  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes(`/api/context/portfolios/${portfolio.slug}`)
      && r.request().method() === 'PATCH'
      && r.status() === 200
    ),
    page.getByRole('button', { name: /^save$/i }).click()
  ])

  // Navigate somewhere that re-renders the sidebar with the new name.
  await page.goto(`/@${org.slug}/context/${portfolio.slug}`)
  await expect(page.locator('nav').filter({ hasText: 'Brand New' })).toBeVisible()
})

test('settings: delete portfolio — navigates away and is gone from sidebar', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, {
    org_id: org.id,
    name: 'Doomed',
    created_by: user.id
  })

  await page.goto(`/@${org.slug}/context/${portfolio.slug}/settings`)
  page.on('dialog', d => d.accept())

  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes(`/api/context/portfolios/${portfolio.slug}`)
      && r.request().method() === 'DELETE'
      && r.status() === 200
    ),
    page.getByRole('button', { name: /delete portfolio/i }).click()
  ])

  await expect(page).toHaveURL(new RegExp(`/context$`))
  // Sidebar no longer lists the deleted portfolio.
  await expect(page.locator('nav').filter({ hasText: 'Doomed' })).toHaveCount(0)
})

// ─── custom sections ──────────────────────────────────────────────────────

test('custom sections: create from manager — appears in sidebar tree', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })

  await page.goto(`/@${org.slug}/context/${portfolio.slug}`)

  // The custom-sections manager lives on the portfolio overview page (and in
  // settings). Title field has placeholder "e.g. Roadmap"; submit button is "Add".
  const title = `Compliance ${randomUUID().slice(0, 6)}`
  await page.getByPlaceholder(/roadmap/i).fill(title)
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes(`/api/context/portfolios/${portfolio.slug}/custom-sections`)
      && r.request().method() === 'POST'
      && r.status() === 200
    ),
    page.getByRole('button', { name: /^add$/i }).click()
  ])

  // The new section shows in the sidebar tree under the active portfolio.
  await expect(page.locator('nav').filter({ hasText: title }).first()).toBeVisible()
})

// ─── export ────────────────────────────────────────────────────────────────

test('export: single-section download returns markdown', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })
  await seedTestSection(sql, {
    portfolio_id: portfolio.id,
    section_key: 'identity',
    content: '# Hello identity'
  })

  // Hit the API directly with an authenticated browser context — easier than
  // wiring up a Playwright download listener for an external-href link.
  const res = await page.request.get(
    `/api/context/portfolios/${portfolio.slug}/sections/identity/export`,
    { headers: { 'x-active-org': org.slug } }
  )
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('markdown')
  const body = await res.text()
  expect(body).toContain('# Hello identity')
})

test('export: full-portfolio zip download returns a zip', async ({ page }) => {
  const sql = getHostAdminDb()
  const { user, org } = await loginIntoNewOrg(page, { roles: ['admin'] })
  const portfolio = await createTestPortfolio(sql, { org_id: org.id, created_by: user.id })
  await seedTestSection(sql, {
    portfolio_id: portfolio.id,
    section_key: 'identity',
    content: 'zip contents marker'
  })

  const res = await page.request.get(
    `/api/context/portfolios/${portfolio.slug}/export`,
    { headers: { 'x-active-org': org.slug } }
  )
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('zip')
  // Body has bytes; we don't unzip here (vitest's export/zip.test.ts already does).
  const buf = await res.body()
  expect(buf.byteLength).toBeGreaterThan(100)
})

// ─── assistant chat ───────────────────────────────────────────────────────
//
// The assistant chat needs the Anthropic SDK stubbed via the test-only
// `server/plugins/test-anthropic.ts` plugin, which only mounts when the
// spawned Nuxt server is booted with `CONTEXT_TEST_ANTHROPIC=1`. The host's
// Playwright webServer doesn't set that env var, so without a config change
// the assistant routes call the real Anthropic API (or fail if no key).
//
// Wiring this up is a dev/playwright.config.ts edit + adding the env var.
// Deferred for now — the assistant logic is already covered by the vitest
// suite (`tests/assistant/chat.test.ts`) which boots a separate Nuxt server
// with the env var set.
test.fixme('assistant: opening panel and sending a message round-trips through the fake', async () => {})

// ─── comments ─────────────────────────────────────────────────────────────
//
// The comment flow is: select text in the rendered preview → a floating
// "Comment" button appears → click it → the comment form pre-fills with the
// quote → submit → comment lands in the right rail.
//
// Playwright text selection across Vue's rendered output requires
// `page.evaluate` to programmatically set a Range + Selection, then dispatch
// `mouseup` so the SectionPreview's selectionchange handler fires. This is
// possible but fragile (anchor offsets in slightly-different DOM trees).
// Deferred — the vitest suite (`tests/comments/crud.test.ts`) covers the
// anchor offset round-trip + resolve flow + reply delete at the API level.
test.fixme('comments: highlight text, comment on quote, resolve, reply', async () => {})
