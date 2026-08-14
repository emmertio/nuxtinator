// Holds every request until the boot-time migration run has finished. See
// `server/utils/migration-state.ts` for why the gate exists and why it starts
// closed.
//
// Once migrations have settled this awaits an already-resolved promise, which
// costs a microtask per request. A failed migration run rejects, and every
// request then reports that rejection rather than a schema error deeper in.
//
// `defineEventHandler` is imported rather than auto-imported so the handler can
// be exercised directly from a test.
import { defineEventHandler } from 'h3'
import { whenMigrationsComplete } from '#core/server/utils/migration-state'

export default defineEventHandler(async () => {
  await whenMigrationsComplete()
})
