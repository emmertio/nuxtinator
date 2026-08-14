// When and whether this process runs the outbound send sweep. Pure, so the
// plugin stays a two-line scheduler and the decision is directly testable.

export interface InboxSendSweepConfig {
  inboxSendSweepEnabled?: boolean
  inboxSendSweepSeconds?: string | number
}

export interface InboxSendSweepSchedule {
  enabled: boolean
  seconds: number
}

const DEFAULT_SECONDS = 20
const MIN_SECONDS = 2
const MAX_SECONDS = 300

export function inboxResolveSendSweepSchedule(config: InboxSendSweepConfig): InboxSendSweepSchedule {
  // Default on: a deployment where nothing sweeps never delivers, so only an
  // explicit `false` stops it.
  const enabled = config.inboxSendSweepEnabled !== false

  const parsed = parseInt(String(config.inboxSendSweepSeconds ?? DEFAULT_SECONDS), 10)
  const seconds = Number.isNaN(parsed) || parsed <= 0
    ? DEFAULT_SECONDS
    : Math.min(Math.max(parsed, MIN_SECONDS), MAX_SECONDS)

  return { enabled, seconds }
}
