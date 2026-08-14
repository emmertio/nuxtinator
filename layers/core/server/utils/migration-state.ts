// Readiness signal for the boot-time migration run.
//
// Nitro invokes plugins without awaiting them, so the HTTP listener opens while
// `plugins/migrations.ts` is still applying migrations. Anything that touches
// the database before then queries tables that do not exist yet, and the
// failure surfaces far from its cause. Everything that runs at boot waits here
// instead: `middleware/00.await-migrations.ts` for the request path, and
// `plugins/seed-apps-catalog.ts`, which runs on Nitro's `request` hook and so
// fires ahead of middleware.
//
// The gate starts CLOSED. A resolved-by-default promise would let anything that
// arrives before the plugin body runs sail straight through to the race this
// exists to prevent — silently, which is the failure mode that took longest to
// find the first time. Today Nitro constructs the app before opening the
// listener, so that window is empty; nothing in the code says it has to stay
// that way.
//
// State lives here rather than in the plugin so that the three files sharing it
// resolve one module through the `#core` alias, instead of depending on the
// bundler collapsing a layer path and a node_modules path into one instance.

let open: () => void
let fail: (err: unknown) => void

const ready = new Promise<void>((resolve, reject) => {
  open = resolve
  fail = reject
})

// Waiters see the rejection; this only stops it from ALSO being an unhandled
// rejection, which would kill the process before any request could report it.
ready.catch(() => {})

/** Resolves once boot migrations have finished; rejects if they failed. */
export function whenMigrationsComplete(): Promise<void> {
  return ready
}

export function markMigrationsComplete(): void {
  open()
}

export function markMigrationsFailed(err: unknown): void {
  fail(err)
}
