#!/usr/bin/env bun

// Demo data seeder. Populates the database with users, roles, a demo org
// (multi-tenant deploys only) and per-app demo content (channels, etc).
//
//   bun run seed
//
// Idempotent: every insert uses ON CONFLICT DO NOTHING so re-running is
// safe. Layer authors add their own seed by creating `<layer>/seeds/index.ts`
// with a default export `(ctx: SeedContext) => Promise<void>`. The runner
// in layers/core/seeds/runner.ts walks the layers in `extends:` order and
// invokes whichever it finds.

import { LAYERS } from '../layers'
import { runSeeds } from '@nuxtinator/core/seeds'

// Drive the seed order off the host roster (single source of truth). The runner
// skips any layer without a seeds/index.ts, so listing every layer is safe.
runSeeds(LAYERS.map(l => l.pkg)).catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
