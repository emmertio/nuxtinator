// Inbox layer — two-way shared email inbox built on the CRM layer's channel
// kernel. Conversations key on crm_channels (the address registry); inbound
// mail arrives via a signed Mailgun webhook, outbound replies ride a
// croner-swept queue on inbox_messages itself.
//
// The layer imports CRM kernel services from `#crm/server` (registered by the
// crm layer's own nuxt.config; aliases merge across extends:). Mailgun sending
// credentials are shared with the email-mailgun layer (same env names —
// duplicate runtimeConfig declarations merge harmlessly); the webhook signing
// key and inbox addressing are inbox-specific.
//
// `#inbox/server` exposes the conversation-creation + channel-claim primitives
// so a future forms layer can create inbox conversations without reaching into
// this layer's file layout. The barrel lives in server/exports/ (not
// server/utils/) so nitro's auto-import scan doesn't double-import the names.
import { fileURLToPath } from 'node:url'

const layerRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineNuxtConfig({
  alias: {
    '#inbox/server': fileURLToPath(new URL('./server/exports/index.ts', import.meta.url))
  },

  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          paths: {
            '#inbox/server': [`${layerRoot}server/exports/index.ts`]
          }
        }
      }
    }
  },

  runtimeConfig: {
    mailgunApiKey: process.env.MAILGUN_API_KEY || '',
    mailgunDomain: process.env.MAILGUN_DOMAIN || '',
    mailgunHost: process.env.MAILGUN_HOST || 'api.mailgun.net',
    // Webhook signing key — a DIFFERENT Mailgun key than the sending API key
    // (Settings → API Keys → "HTTP webhook signing key").
    mailgunWebhookSigningKey: process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '',
    // Domain inbound mail is addressed to (MX → Mailgun catch-all route).
    // Per-org overrides live in inbox_settings; this is the code default.
    inboxDomain: process.env.INBOX_DOMAIN || '',
    // Shared/system From identity and the base of contact+<token> reply
    // addresses, e.g. "contact@example.com".
    inboxContactAddress: process.env.INBOX_CONTACT_ADDRESS || '',
    // Send-sweep cadence in seconds. Tests lower it to make queued sends
    // observable quickly.
    inboxSendSweepSeconds: process.env.INBOX_SEND_SWEEP_SECONDS || '20',
    // Whether this process runs the outbound send sweep at all. On by default:
    // a deployment that never sweeps never delivers. Set it false where several
    // servers share one database and only one of them should sweep — see
    // `server/plugins/inbox-send-sweep.ts`.
    inboxSendSweepEnabled: process.env.NUXT_INBOX_SEND_SWEEP_ENABLED !== 'false',
    // Cron for the daily AI grounding sync (UTC). Default 03:00.
    inboxGroundingSyncCron: process.env.INBOX_GROUNDING_SYNC_CRON || '0 3 * * *'
  }
})
