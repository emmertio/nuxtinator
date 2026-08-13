// CRM-layer test helpers. Re-exports tenancy + core helpers and adds
// helpers for seeding crm_* rows and cleaning up.
//
// All seeded data is prefixed `test-crm-` (users, org slugs) so
// `cleanupCrmTestData` can scope deletes by ownership of the rows. crm_*
// content cascades off orgs (org_id, multi-tenant retrofit) and off
// crm_records; crm_records.created_by is ON DELETE RESTRICT, so record rows
// are wiped explicitly before users.
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

// Users / orgs are tagged with `test-crm-` so per-layer cleanup stays
// scoped. Anything tagged `test-tenancy-` or `test-core-` is owned by other
// layers and left alone here.
export async function createCrmUser(
  sql: ReturnType<typeof postgres>,
  opts: Parameters<typeof createTestUser>[1] = {}
): Promise<TestUser> {
  return createTestUser(sql, {
    ...opts,
    email: opts.email ?? `test-crm-${randomUUID().slice(0, 8)}@example.com`
  })
}

export async function createCrmOrg(
  sql: ReturnType<typeof postgres>,
  opts: { slug?: string, name?: string } = {}
): Promise<TestOrg> {
  return createTestOrg(sql, {
    slug: opts.slug ?? `test-crm-${randomUUID().slice(0, 8)}`,
    name: opts.name ?? 'Test CRM Org'
  })
}

// Build a complete org with a user that has the given roles. Default role is
// `admin` so the user gets every registered permission via the admin
// special-case in rbac.ts.
export async function createCrmOrgWith(
  sql: ReturnType<typeof postgres>,
  roles: string[] = ['admin']
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders }> {
  const user = await createCrmUser(sql)
  const org = await createCrmOrg(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  return { org, user, auth: getAuthHeaders(user) }
}

// Add another user to an existing org, returning the user + auth bundle.
export async function addCrmMember(
  sql: ReturnType<typeof postgres>,
  orgId: string,
  roles: string[] = ['member']
): Promise<{ user: TestUser, auth: AuthHeaders }> {
  const user = await createCrmUser(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: orgId, roles })
  return { user, auth: getAuthHeaders(user) }
}

// Seed a contact directly via the host-admin pool (BYPASSRLS), bypassing the
// POST records route. Multi-tenant retrofit adds `org_id NOT NULL DEFAULT
// current_org_id()` — the GUC isn't set outside `defineTenantHandler`'s txn,
// so the seed must supply org_id explicitly. `data` is bound through
// ::text::jsonb — postgres-js double-encodes a pre-stringified param bound
// with a bare ::jsonb cast, storing a jsonb string scalar that degrades the
// doc on the kernel's first `||` merge (dev.md gotcha 1).
export async function createTestContact(
  sql: ReturnType<typeof postgres>,
  opts: {
    org_id: string
    created_by: string
    name?: string
    status?: string | null
    data?: Record<string, unknown>
    record_type?: string
  }
): Promise<{ id: string, name: string }> {
  const id = randomUUID()
  const name = opts.name ?? `test-crm-contact-${randomUUID().slice(0, 8)}`
  await sql`
    INSERT INTO crm_records (id, record_type, name, status, data, created_by, org_id)
    VALUES (${id}, ${opts.record_type ?? 'contacts'}, ${name}, ${opts.status ?? null},
            ${JSON.stringify(opts.data ?? {})}::text::jsonb, ${opts.created_by}, ${opts.org_id})
  `
  return { id, name }
}

// Wipe every crm_* row owned by data this layer's tests created.
//
// Order matters: crm_records rows must go before users (created_by is ON
// DELETE RESTRICT); the record delete cascades entries, user refs,
// connections, shares, channel links, activity, and comments. Channels (and
// through them consents, suppressions, events) plus the definition tables
// are org-scoped and go by org. We over-delete intentionally: any crm_records
// row created by a test-prefixed user of any layer is fair game.
export async function cleanupCrmTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`
    DELETE FROM crm_records
    WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')
  `
  await sql`
    DELETE FROM crm_consent_events
    WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-crm-%')
  `
  await sql`
    DELETE FROM crm_channels
    WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-crm-%')
  `
  await sql`
    DELETE FROM crm_channel_types
    WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-crm-%')
  `
  await sql`
    DELETE FROM crm_record_fields
    WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-crm-%')
  `
  await sql`
    DELETE FROM crm_record_types
    WHERE org_id IN (SELECT id FROM orgs WHERE slug LIKE 'test-crm-%')
  `
  // Orgs created by this layer's tests (cascades into memberships, org_apps,
  // and any leftover org-scoped crm rows).
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-crm-%'`
  await sql`
    DELETE FROM activity_logs
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-crm-%@example.com')
  `
  await sql`DELETE FROM users WHERE email LIKE 'test-crm-%@example.com'`
}
