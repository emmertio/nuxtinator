// Schedules the outbound send sweep (see inbox-send-processor.ts). Cadence
// comes from runtimeConfig.inboxSendSweepSeconds so tests can shrink it.
// `protect: true` prevents same-process overlap; the advisory lock adds
// cross-replica safety.
import { Cron } from 'croner'

export default defineNitroPlugin(() => {
  // Don't run crons in build / prepare / typecheck contexts.
  if (process.env.NUXT_PREPARE_BUILD || process.env.NITRO_PRESET === 'prepare') return

  // Under vitest, every layer's project boots its own server and they all share
  // one test database — so eleven of them contend for a lock that, by design,
  // exactly one holder wins. The inbox project is the only one with queued mail
  // and it routinely lost, leaving its rows untouched at `attempts: 0`. Only
  // the server that opts in sweeps; inbox's global setup passes the flag
  // through `createTest({ env })`, which reaches its own server and no other.
  // Outside vitest nothing changes.
  if (process.env.VITEST && !process.env.INBOX_SEND_SWEEP_ENABLED) return

  const config = useRuntimeConfig()
  const seconds = Math.min(Math.max(parseInt(String(config.inboxSendSweepSeconds || '20'), 10) || 20, 2), 300)

  new Cron(`*/${seconds} * * * * *`, { protect: true }, () => {
    void inboxWithAdvisoryLock(INBOX_SEND_SWEEP_LOCK_KEY, 'send sweep', () => inboxRunSendSweep())
      .catch(err => console.error('[inbox] send sweep error:', err))
  })

  console.log(`[inbox] send sweep started — every ${seconds}s`)
})
