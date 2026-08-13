// Files-layer test helpers. Re-exports tenancy + core helpers, adds helpers
// for seeding files_* rows and cleaning up. All seeded data is prefixed
// `test-files-` (users, orgs) so cleanup stays scoped.
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

export async function createFilesUser(
  sql: ReturnType<typeof postgres>,
  opts: Parameters<typeof createTestUser>[1] = {}
): Promise<TestUser> {
  return createTestUser(sql, {
    ...opts,
    email: opts.email ?? `test-files-${randomUUID().slice(0, 8)}@example.com`
  })
}

export async function createFilesOrg(
  sql: ReturnType<typeof postgres>,
  opts: { slug?: string, name?: string } = {}
): Promise<TestOrg> {
  return createTestOrg(sql, {
    slug: opts.slug ?? `test-files-${randomUUID().slice(0, 8)}`,
    name: opts.name ?? 'Test Files Org'
  })
}

// Org + a user with the given roles (default admin → every registered perm).
export async function createFilesOrgWith(
  sql: ReturnType<typeof postgres>,
  roles: string[] = ['admin']
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders }> {
  const user = await createFilesUser(sql)
  const org = await createFilesOrg(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  return { org, user, auth: getAuthHeaders(user) }
}

export async function addFilesMember(
  sql: ReturnType<typeof postgres>,
  orgId: string,
  roles: string[] = ['member']
): Promise<{ user: TestUser, auth: AuthHeaders }> {
  const user = await createFilesUser(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: orgId, roles })
  return { user, auth: getAuthHeaders(user) }
}

// Seed a doc item + its initial version directly (BYPASSRLS). Multi-tenant
// mode needs org_id on every files_* row.
export async function createTestDoc(
  sql: ReturnType<typeof postgres>,
  opts: { org_id: string, created_by: string, title?: string, body_md?: string }
): Promise<{ id: string }> {
  const id = randomUUID()
  const title = opts.title ?? `test-files-doc-${randomUUID().slice(0, 8)}`
  const body = opts.body_md ?? '# Hello\n\nseed body'
  await sql`
    INSERT INTO files_items (id, kind, title, body_md, created_by, last_edited_by, org_id)
    VALUES (${id}, 'doc', ${title}, ${body}, ${opts.created_by}, ${opts.created_by}, ${opts.org_id})
  `
  await sql`
    INSERT INTO files_versions (item_id, title, content, edited_by, org_id)
    VALUES (${id}, ${title}, ${body}, ${opts.created_by}, ${opts.org_id})
  `
  return { id }
}

// Seed a site item (self-contained HTML in body_md) + its initial version.
export async function createTestSite(
  sql: ReturnType<typeof postgres>,
  opts: { org_id: string, created_by: string, title?: string, html?: string }
): Promise<{ id: string }> {
  const id = randomUUID()
  const title = opts.title ?? `test-files-site-${randomUUID().slice(0, 8)}`
  const html = opts.html ?? '<!doctype html><html><body><h1>seed site</h1></body></html>'
  await sql`
    INSERT INTO files_items (id, kind, title, body_md, created_by, last_edited_by, org_id)
    VALUES (${id}, 'site', ${title}, ${html}, ${opts.created_by}, ${opts.created_by}, ${opts.org_id})
  `
  await sql`
    INSERT INTO files_versions (item_id, title, content, edited_by, org_id)
    VALUES (${id}, ${title}, ${html}, ${opts.created_by}, ${opts.org_id})
  `
  return { id }
}

// Seed a file item. storage_key can be fake — generateSignedUrl only builds a
// presigned URL string and doesn't verify the object exists.
export async function createTestFile(
  sql: ReturnType<typeof postgres>,
  opts: { org_id: string, created_by: string, title?: string, filename?: string, mime?: string }
): Promise<{ id: string }> {
  const id = randomUUID()
  const filename = opts.filename ?? 'seed.bin'
  await sql`
    INSERT INTO files_items (id, kind, title, storage_key, filename, mime, size_bytes, created_by, org_id)
    VALUES (${id}, 'file', ${opts.title ?? filename}, ${`uploads/${id}.bin`}, ${filename},
            ${opts.mime ?? 'application/octet-stream'}, 1234, ${opts.created_by}, ${opts.org_id})
  `
  return { id }
}

// Read an item's share_token directly (BYPASSRLS) for public-route tests.
export async function getShareToken(
  sql: ReturnType<typeof postgres>,
  id: string
): Promise<string | null> {
  const rows = await sql`SELECT share_token FROM files_items WHERE id = ${id}`
  return (rows[0]?.share_token as string | null) ?? null
}

export async function cleanupFilesTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`
    DELETE FROM files_versions
    WHERE item_id IN (
      SELECT id FROM files_items
      WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
    )
  `
  await sql`
    DELETE FROM files_items
    WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-files-%' OR slug LIKE 'test-tenancy-%'`
  await sql`DELETE FROM activity_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')`
  await sql`DELETE FROM users WHERE email LIKE 'test-files-%@example.com'`
}
