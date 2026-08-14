// The boot-time migration gate. Nitro opens the HTTP listener while the
// migrations plugin is still running, so everything that touches the database
// at boot waits on this signal instead. What matters, and what these tests
// pin, is that the gate starts CLOSED — a gate that defaults to open lets the
// first requests through to an unmigrated schema and reports nothing, which is
// exactly the bug it exists to prevent.
//
// Each case imports a fresh copy of the module: the deferred is process-global
// by design, so settling it once would leak into the next assertion.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const STATE = '#core/server/utils/migration-state'
const MIDDLEWARE = '#core/server/middleware/00.await-migrations'

type StateModule = typeof import('#core/server/utils/migration-state')

async function freshState(): Promise<StateModule> {
  vi.resetModules()
  return await import(STATE)
}

// Resolves to `true` if the promise settles within a few macrotasks, `false`
// if it is still pending. Long enough that a resolved promise always wins,
// short enough that a pending one doesn't stall the suite.
async function settlesSoon(p: Promise<unknown>): Promise<boolean> {
  const pending = Symbol('pending')
  const timer = new Promise<typeof pending>(resolve => setTimeout(() => resolve(pending), 50))
  const winner = await Promise.race([p.then(() => 'settled').catch(() => 'settled'), timer])
  return winner !== pending
}

describe('migration readiness gate', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('stays closed until migrations report completion', async () => {
    const state = await freshState()

    expect(await settlesSoon(state.whenMigrationsComplete())).toBe(false)

    state.markMigrationsComplete()
    await expect(state.whenMigrationsComplete()).resolves.toBeUndefined()
  })

  it('hands a failed migration run to every waiter instead of opening', async () => {
    const state = await freshState()
    const boom = new Error('migration 007 blew up')

    state.markMigrationsFailed(boom)

    await expect(state.whenMigrationsComplete()).rejects.toThrow('migration 007 blew up')
  })

  it('does not turn a failed run into an unhandled rejection', async () => {
    const state = await freshState()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    state.markMigrationsFailed(new Error('nobody is listening yet'))
    await new Promise(resolve => setTimeout(resolve, 50))

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('holds a request until the gate opens', async () => {
    // Guards the middleware itself: drop its `await` and this request resolves
    // immediately against a schema that does not exist yet.
    const state = await freshState()
    const handler = (await import(MIDDLEWARE)).default as () => Promise<void>

    const inFlight = handler()
    expect(await settlesSoon(inFlight)).toBe(false)

    state.markMigrationsComplete()
    await expect(inFlight).resolves.toBeUndefined()
  })

  it('fails the request when migrations failed, rather than letting it through', async () => {
    const state = await freshState()
    const handler = (await import(MIDDLEWARE)).default as () => Promise<void>

    const inFlight = handler()
    state.markMigrationsFailed(new Error('migration 007 blew up'))

    await expect(inFlight).rejects.toThrow('migration 007 blew up')
  })
})
