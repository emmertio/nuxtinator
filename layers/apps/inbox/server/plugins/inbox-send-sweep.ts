// Schedules the outbound send sweep (see inbox-send-processor.ts). Cadence
// comes from runtimeConfig.inboxSendSweepSeconds so tests can shrink it.
// `protect: true` prevents same-process overlap; the advisory lock adds
// cross-replica safety.
import { Cron } from 'croner'

export default defineNitroPlugin(() => {
  // Don't run crons in build / prepare / typecheck contexts.
  if (process.env.NUXT_PREPARE_BUILD || process.env.NITRO_PRESET === 'prepare') return

  // The sweep is a cluster singleton, gated on a Postgres advisory lock, so
  // exactly one process per database wins it. That is right in production and
  // wrong under vitest, where all eleven layer projects boot a server against
  // ONE shared test database: eleven contenders for a single lock, and the
  // inbox project — the only one with queued mail — kept losing, leaving its
  // rows at `attempts: 0`. The test config turns the sweep off for every
  // server and inbox's global setup turns it back on for its own.
  //
  // Note this sidesteps the contention rather than fixing it. Give a second
  // project queued mail and it returns; the real fix is a database per project.
  const { enabled, seconds } = inboxResolveSendSweepSchedule(useRuntimeConfig())
  if (!enabled) {
    console.log('[inbox] send sweep disabled by config — not scheduling')
    return
  }

  new Cron(`*/${seconds} * * * * *`, { protect: true }, () => {
    void inboxWithAdvisoryLock(INBOX_SEND_SWEEP_LOCK_KEY, 'send sweep', () => inboxRunSendSweep())
      .catch(err => console.error('[inbox] send sweep error:', err))
  })

  console.log(`[inbox] send sweep started — every ${seconds}s`)
})
