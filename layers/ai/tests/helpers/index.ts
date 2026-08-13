// AI-layer test helpers. Re-exports tenancy + core helpers and adds an
// operator-admin-in-a-fresh-org bootstrap (the AI admin endpoints gate on
// requireOperatorAdmin and run in the org tx) plus prefix-scoped cleanup.
//
// All seeded data is prefixed `test-ai-` (users, org slugs) so cleanup stays
// scoped. AI config is stored in org-scoped core_settings, which cascade off
// orgs, so wiping the test orgs clears it.
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getAuthHeaders,
  withOrgHeader,
  createTestOrg,
  addTestMembership,
  type AuthHeaders,
  type TestUser,
  type TestOrg
} from '@nuxtinator/tenancy/test-helpers'

export * from '@nuxtinator/tenancy/test-helpers'

// An operator-admin user (users.is_admin) in a fresh org with membership, plus
// the X-Active-Org opts the AI admin endpoints need. Pass `{ admin: false }` for
// a non-operator user to assert the 403 gate.
export async function createAiOrg(
  sql: ReturnType<typeof postgres>,
  { admin = true }: { admin?: boolean } = {}
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders, opts: ReturnType<typeof withOrgHeader> }> {
  const user = await createTestUser(sql, {
    email: `test-ai-${randomUUID().slice(0, 8)}@example.com`,
    is_admin: admin
  })
  const org = await createTestOrg(sql, {
    slug: `test-ai-${randomUUID().slice(0, 8)}`,
    name: 'Test AI Org'
  })
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles: ['admin'] })

  const auth = getAuthHeaders(user)
  return { org, user, auth, opts: withOrgHeader(auth, org.slug) }
}

export async function cleanupAiTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-ai-%'`
  await sql`DELETE FROM users WHERE email LIKE 'test-ai-%'`
}
