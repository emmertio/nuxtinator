// Context-layer test helpers. Re-exports tenancy + core helpers (so other
// layers / future suites can import them all from one place) and adds
// helpers for seeding context_* rows and cleaning up.
//
// All seeded data is prefixed `test-context-` (users, org slugs, portfolio
// slugs) so `cleanupContextTestData` can scope deletes by ownership of the
// rows. Cleanup runs orgs → users last so cascade FKs unwind portfolios,
// sections, comments, etc.
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getAuthHeaders,
  type AuthHeaders,
  type TestUser,
  createTestOrg,
  addTestMembership,
  type TestOrg
} from '@nuxtinator/tenancy/test-helpers'

export * from '@nuxtinator/tenancy/test-helpers'
export * from './assistant'

// Users / orgs are tagged with `test-context-` so per-layer cleanup stays
// scoped. Anything tagged `test-tenancy-` or `test-core-` is owned by other
// layers and left alone here.
export async function createContextUser(
  sql: ReturnType<typeof postgres>,
  opts: Parameters<typeof createTestUser>[1] = {}
): Promise<TestUser> {
  return createTestUser(sql, {
    ...opts,
    email: opts.email ?? `test-context-${randomUUID().slice(0, 8)}@example.com`
  })
}

export async function createContextOrg(
  sql: ReturnType<typeof postgres>,
  opts: { slug?: string, name?: string } = {}
): Promise<TestOrg> {
  return createTestOrg(sql, {
    slug: opts.slug ?? `test-context-${randomUUID().slice(0, 8)}`,
    name: opts.name ?? `Test Context Org`
  })
}

// Build a complete org with a user that has the given roles. Default role is
// `admin` so the user gets every registered permission via the admin
// special-case in rbac.ts.
export async function createContextOrgWith(
  sql: ReturnType<typeof postgres>,
  roles: string[] = ['admin']
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders }> {
  const user = await createContextUser(sql)
  const org = await createContextOrg(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  return { org, user, auth: getAuthHeaders(user) }
}

// Add another user to an existing org, returning the user + auth bundle.
export async function addContextMember(
  sql: ReturnType<typeof postgres>,
  orgId: string,
  roles: string[] = ['member']
): Promise<{ user: TestUser, auth: AuthHeaders }> {
  const user = await createContextUser(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: orgId, roles })
  return { user, auth: getAuthHeaders(user) }
}

// Seed a portfolio directly via the host-admin pool (BYPASSRLS). Multi-tenant
// retrofit adds `org_id NOT NULL DEFAULT current_org_id()` — but the GUC isn't
// set outside `defineTenantHandler`'s txn, so the seed must supply org_id
// explicitly to satisfy NOT NULL.
export interface TestPortfolio {
  id: string
  slug: string
  name: string
}

export async function createTestPortfolio(
  sql: ReturnType<typeof postgres>,
  opts: { org_id: string, slug?: string, name?: string, created_by?: string }
): Promise<TestPortfolio> {
  const id = randomUUID()
  const slug = opts.slug ?? `test-context-${randomUUID().slice(0, 8)}`
  const name = opts.name ?? 'Test Portfolio'
  await sql`
    INSERT INTO context_portfolios (id, slug, name, org_id)
    VALUES (${id}, ${slug}, ${name}, ${opts.org_id})
  `
  return { id, slug, name }
}

// Seed a section directly. Used by tests that exercise read-side endpoints
// without going through the PUT endpoint as setup.
export async function seedTestSection(
  sql: ReturnType<typeof postgres>,
  opts: { portfolio_id: string, section_key: string, content?: string, last_edited_by?: string | null }
): Promise<{ id: string }> {
  const id = randomUUID()
  const content = opts.content ?? ''
  await sql`
    INSERT INTO context_sections (id, portfolio_id, section_key, content, last_edited_by)
    VALUES (${id}, ${opts.portfolio_id}, ${opts.section_key}, ${content}, ${opts.last_edited_by ?? null})
  `
  return { id }
}

// Seed a custom section definition. Used by catalog ordering + isolation tests.
export async function seedTestCustomSection(
  sql: ReturnType<typeof postgres>,
  opts: { portfolio_id: string, key: string, title: string, description?: string, order?: number, created_by: string }
): Promise<{ id: string }> {
  const id = randomUUID()
  await sql`
    INSERT INTO context_custom_section_definitions
      (id, portfolio_id, key, title, description, "order", created_by)
    VALUES (${id}, ${opts.portfolio_id}, ${opts.key}, ${opts.title}, ${opts.description ?? ''}, ${opts.order ?? 0}, ${opts.created_by})
  `
  return { id }
}

// Wipe every context_* row owned by data this layer's tests created. The
// strategy: context tables CASCADE off context_portfolios; portfolios CASCADE
// off orgs (multi-tenant retrofit); so deleting the portfolio (or its parent
// org) drops everything beneath it.
//
// We over-delete intentionally: any context_* row whose author is a
// test-context-/test-tenancy-/test-core- user is fair game. Activity logs
// authored by those users also get swept.
export async function cleanupContextTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  // Comment replies cascade off comments, comments cascade off sections,
  // sections cascade off portfolios. Belt-and-braces: explicit deletes for
  // any leak rows whose author/editor is a test user but whose parent
  // portfolio happens to not be test-prefixed.
  await sql`
    DELETE FROM context_section_comment_replies
    WHERE author_id IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`
    DELETE FROM context_section_comments
    WHERE author_id IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`
    DELETE FROM context_section_versions
    WHERE edited_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`
    DELETE FROM context_sections
    WHERE last_edited_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`
    DELETE FROM context_custom_section_definitions
    WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  // Portfolios: by slug prefix and by membership in a test org. CASCADE
  // wipes any remaining sections / comments / replies / customs / versions.
  await sql`
    DELETE FROM context_portfolios
    WHERE slug LIKE 'test-context-%'
       OR org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-%')
  `
  // Orgs created by this layer's tests (cascades into memberships,
  // org_apps, role overrides, any leftover portfolios).
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-context-%'`
  // Activity logs and users authored by this layer's tests.
  await sql`
    DELETE FROM activity_logs
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-context-%@example.com')
  `
  await sql`DELETE FROM users WHERE email LIKE 'test-context-%@example.com'`
}
