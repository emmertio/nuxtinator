// Holds every request until the boot-time migration run has finished.
//
// Nitro invokes plugins without awaiting them, so `plugins/migrations.ts`
// is still working when the HTTP listener opens. Without this gate the first
// requests after a cold start query tables the pending migrations are about
// to create, and the failure surfaces far from its cause — as a "relation
// does not exist" error inside whatever endpoint happened to be first.
//
// Once migrations have settled this awaits an already-resolved promise, which
// costs a microtask per request. A failed migration run rejects, and every
// request then reports that rejection rather than a schema error further in.
import { whenMigrationsComplete } from '../plugins/migrations'

export default defineEventHandler(async () => {
  await whenMigrationsComplete()
})
