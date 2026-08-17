// Vitest config — one project per layer. Projects run in parallel by default;
// each project's files run serial (per-test cleanup is reliable, file-level
// parallelism would race). Each layer prefixes its test data so layers
// running in parallel can't collide.
//
// Add new layers by appending another `layerProject(...)` entry.

import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { resolve } from 'node:path'

// MUST be set before vitest defaults NODE_ENV to 'test'. The Nuxt/Nitro
// build inlines `process.env.NODE_ENV` into the bundle, and the email layer
// switches Mailpit vs. Mailgun on `=== 'development'`. With NODE_ENV='test'
// at build time, the bundled `isDevelopment` is forever false → real Mailgun
// → tests fail. Setting it here pins it through the build.
process.env.NODE_ENV = 'development'

const env = loadEnv('test', process.cwd(), '')

// Forward test DB URLs into the test process. The per-layer global-setup
// then promotes them to DATABASE_URL / APP_DATABASE_URL for the spawned Nuxt.
// S3 credentials come along too so tests can assert directly against the
// bucket (e.g. that org offboarding actually removed the objects).
for (const k of ['TEST_DATABASE_URL', 'TEST_APP_DATABASE_URL', 'JWT_SECRET', 'TEST_MAILHOG_URL', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME']) {
  if (env[k]) process.env[k] = env[k]
}

// Every project boots its own Nuxt server against the SAME database, so a job
// that is meant to be a cluster singleton can only belong to one of them. This
// reaches all eleven, since they inherit `process.env`; the project that owns
// the job turns it back on for its own server through `createTest({ env })`,
// which reaches that server and no other.
process.env.NUXT_INBOX_SEND_SWEEP_ENABLED = 'false'

// The same alias core's nuxt.config declares. Without it a test can only reach
// a core module by a relative path that climbs out of its own layer — which
// `verify-layers` rejects, for good reason. Projects don't inherit root-level
// resolve config, so it goes on each one.
const layerAliases = {
  '#core': resolve(__dirname, '../layers/core')
}

interface LayerProject {
  resolve: { alias: Record<string, string> }
  test: {
    name: string
    include: string[]
    globalSetup: string[]
    fileParallelism: false
    testTimeout: number
    sequence: { hooks: 'list' }
  }
}

function layerProject(name: string, root: string): LayerProject {
  return {
    resolve: { alias: layerAliases },
    test: {
      name,
      include: [resolve(__dirname, root, '**/*.test.ts')],
      globalSetup: [resolve(__dirname, root, 'global-setup.ts')],
      fileParallelism: false,
      testTimeout: 60_000,
      sequence: { hooks: 'list' }
    }
  }
}

export default defineConfig({
  // Don't wipe the terminal between runs — kills the test summary in some
  // shells and obscures historical results in scrollback.
  clearScreen: false,
  test: {
    reporters: ['verbose'],
    // Per-layer projects. Projects run in parallel; files within each project
    // are serial (fileParallelism: false above).
    projects: [
      layerProject('core', '../layers/core/tests'),
      layerProject('tenancy', '../layers/tenancy/tests'),
      layerProject('messages', '../layers/apps/messages/tests'),
      layerProject('videos', '../layers/apps/videos/tests'),
      layerProject('feedback', '../layers/apps/feedback/tests'),
      layerProject('list-of-100', '../layers/apps/list-of-100/tests'),
      layerProject('files', '../layers/apps/files/tests'),
      layerProject('context', '../layers/apps/context/tests'),
      layerProject('crm', '../layers/apps/crm/tests'),
      layerProject('inbox', '../layers/apps/inbox/tests'),
      layerProject('ai', '../layers/ai/tests')
    ]
  }
})
