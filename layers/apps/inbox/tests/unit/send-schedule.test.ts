// The send sweep's start-or-not decision and its cadence clamp. The sweep is a
// cluster singleton on a shared database, so "does this process schedule it"
// is a real behaviour with two ways to be wrong: a deployment where nothing
// sweeps never delivers, and a test topology where everything sweeps loses the
// lock race for the one project that needs it.
import { describe, it, expect } from 'vitest'
import { inboxResolveSendSweepSchedule } from '../../server/utils/inbox-send-schedule'

describe('send sweep schedule', () => {
  it('runs by default — an unconfigured deployment still delivers', () => {
    expect(inboxResolveSendSweepSchedule({}).enabled).toBe(true)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '20' }).enabled).toBe(true)
  })

  it('stands down only on an explicit false', () => {
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepEnabled: false }).enabled).toBe(false)
    // Nuxt coerces `NUXT_INBOX_SEND_SWEEP_ENABLED` to a boolean before it lands
    // in runtimeConfig; nothing else may switch the sweep off by accident.
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepEnabled: true }).enabled).toBe(true)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepEnabled: undefined }).enabled).toBe(true)
  })

  it('defaults the cadence to 20s', () => {
    expect(inboxResolveSendSweepSchedule({}).seconds).toBe(20)
  })

  it('honours a configured cadence', () => {
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '2' }).seconds).toBe(2)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: 45 }).seconds).toBe(45)
  })

  it('clamps a cadence the cron expression could not express', () => {
    // `*/N * * * * *` needs 1..59 in the seconds field to mean anything sane,
    // and a sub-2s sweep would hammer the lock.
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '1' }).seconds).toBe(2)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '9999' }).seconds).toBe(300)
  })

  it('falls back to the default rather than scheduling on garbage', () => {
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: 'soon' }).seconds).toBe(20)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '0' }).seconds).toBe(20)
    expect(inboxResolveSendSweepSchedule({ inboxSendSweepSeconds: '-5' }).seconds).toBe(20)
  })
})
