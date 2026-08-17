import { Migrator, type Migration, type MigrationProvider } from 'kysely'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createKyselyDb } from '#core/server/utils/db-connection'
import { markMigrationsComplete, markMigrationsFailed } from '#core/server/utils/migration-state'

// Migration runner. Builds its own Kysely client connecting via DATABASE_URL.
// In single-tenant mode that's just the database. In multi-tenant mode it's
// the BYPASSRLS `host_admin` role so ALTER TABLE / RLS-policy operations work.
//
// Two migration sources:
//   1. layerMigrationPaths — every layer's `migrations/` folder (regular
//      `<NNN>_*.ts` files). Set by `modules/migrations.ts`.
//   2. tenancyMigrationPaths — same folders, but only `*_T<NNN>_*.ts` files
//      (per-app tenancy retrofits). Set by `optional-tenancy/modules/tenant-migrations.ts`
//      and ONLY populated when the tenancy layer is loaded.
//
// In single mode, tenancyMigrationPaths is empty / undefined and the
// `_T_` migrations stay on disk unread.

interface ProviderOpts {
  regularFolders: string[]
  tenancyFolders: string[]
}

class LayeredMigrationProvider implements MigrationProvider {
  constructor(private readonly opts: ProviderOpts) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {}

    const collect = async (folder: string, includeTenancy: boolean) => {
      let entries: string[] = []
      try {
        entries = await fs.readdir(folder)
      } catch {
        return
      }

      for (const entry of entries) {
        if (!entry.endsWith('.ts') && !entry.endsWith('.js') && !entry.endsWith('.mjs')) continue
        const isTenancy = /_T\d+_/.test(entry)
        if (isTenancy && !includeTenancy) continue
        if (!isTenancy && includeTenancy) continue  // when scanning tenancy folders, ignore regulars (already collected)
        const baseName = entry.replace(/\.(ts|js|mjs)$/, '')
        // Per-app tenancy migrations (`*_T<NNN>_*`) depend on the tenancy
        // layer's own schema (orgs table, `current_org_id()` function). They
        // must run AFTER every other layer's regular migrations and after
        // `tenancy_*` core migrations. Kysely sorts migrations by name, so
        // we suffix-prefix the key with `zzz_` to push them to the back.
        const name = isTenancy ? `zzz_${baseName}` : baseName
        if (migrations[name]) {
          throw new Error(`Duplicate migration name "${name}" found in multiple folders`)
        }
        const fullPath = path.join(folder, entry)
        const mod = await import(pathToFileURL(fullPath).href)
        migrations[name] = mod
      }
    }

    for (const folder of this.opts.regularFolders) {
      await collect(folder, false)
    }
    for (const folder of this.opts.tenancyFolders) {
      await collect(folder, true)
    }

    return migrations
  }
}

// The plugin runs migrations; `server/utils/migration-state.ts` owns the
// readiness signal everything else waits on, and explains why it has to start
// closed.
export default defineNitroPlugin(() => {
  runMigrations().then(markMigrationsComplete, markMigrationsFailed)
})

async function runMigrations(): Promise<void> {
  const config = useRuntimeConfig()
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping migrations')
    return
  }

  const adminDb = createKyselyDb<unknown>(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 30
  })

  const regularFolders = [
    path.join(process.cwd(), 'migrations'),
    ...((config.layerMigrationPaths as string[] | undefined) || []).filter(Boolean)
  ]
  const tenancyFolders = ((config.tenancyMigrationPaths as string[] | undefined) || []).filter(Boolean)

  const migrator = new Migrator({
    db: adminDb,
    provider: new LayeredMigrationProvider({ regularFolders, tenancyFolders }),
    // Layers can ship new migrations whose names don't sort after every
    // already-executed one — allow unordered runs.
    allowUnorderedMigrations: true
  })

  const all = await migrator.getMigrations()
  const pending = all.filter(m => !m.executedAt)

  if (pending.length === 0) {
    console.log('Migrations already up-to-date')
    return
  }

  console.log(`Running ${pending.length} pending migration(s)...`)
  for (const m of pending) {
    console.log(`  Migration: ${m.name}`)
  }

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((r) => {
    if (r.status === 'Success') console.log(`✓ ${r.migrationName}`)
    if (r.status === 'Error') console.error(`✗ ${r.migrationName}`)
  })

  if (error) {
    console.error('Migration failed:', error)
    throw error
  }

  console.log('Migrations complete')
}
