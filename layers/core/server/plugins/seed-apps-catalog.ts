import { db as adminDb } from '#core/server/utils/database'
import { getRegisteredApps } from '../utils/app-registry'
import { whenMigrationsComplete } from './migrations'

// Seeds the global `apps` catalog with one row per registered app layer.
//
// Idempotency rule: `INSERT ... ON CONFLICT DO NOTHING`, never `DO UPDATE`.
// The plugin runs on every `bun dev` boot and on every prod deploy. If it
// `DO UPDATE`d the `status` column, every restart would wipe out the host
// admin's `available`/`default`/`disabled` choices. Status is mutable
// host-admin state — the seeder owns row existence, the host admin owns
// row contents.
//
// New apps land with the registry's declared `defaultStatus` (or
// `'available'` if the layer didn't declare one — the safe fallback,
// since host admin must opt in to `default` for it to auto-enable for
// all orgs). The seeder only ever INSERTs; the declared default is
// dormant once a row exists.
//
// Apps removed from the registry (layer uninstalled): the plugin does NOT
// delete the row. It stays around so re-installing the layer restores
// history. A separate `/admin/apps` UI lets host admin manually purge.
//
// ## Why we defer to first request
//
// Nitro plugins from the host run BEFORE plugins from app layers under
// `layers/apps/<id>/`. If we called `getRegisteredApps()` at plugin time
// the registry would be empty (mail/calendar's `register-*.ts` hasn't run
// yet) and we'd silently seed nothing. Hooking `request` with `hookOnce`
// fires exactly once on the first incoming HTTP request — by which time
// every plugin has finished initialising and the registry is populated.
//
// The `request` hook runs ahead of server middleware, so it can't rely on
// `00.await-migrations` to have gated it; on a fresh database the `apps` table
// would not exist yet. It waits on the same promise directly.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce('request', async () => {
    await whenMigrationsComplete()

    const apps = getRegisteredApps()
    if (apps.length === 0) return

    const databaseUrl = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
    if (!databaseUrl) return

    for (const app of apps) {
      try {
        await adminDb
          .insertInto('apps')
          .values({ id: app.id, status: app.defaultStatus ?? 'available' })
          .onConflict(oc => oc.column('id').doNothing())
          .execute()
      } catch (err) {
        // Loud, and at error level: a swallowed warning here is what kept the
        // pre-migration race invisible for as long as it was. The loop still
        // continues so one bad app can't cost the rest their catalog row, and
        // the insert is idempotent, so the next boot retries.
        console.error(`[seed-apps-catalog] failed to seed app "${app.id}":`, err)
      }
    }
    console.log(`[seed-apps-catalog] ensured ${apps.length} apps in catalog: ${apps.map(a => a.id).join(', ')}`)
  })
})
