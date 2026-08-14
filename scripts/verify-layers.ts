#!/usr/bin/env bun
//
// Layer roster doctor — `bun run verify-layers` (from dev/).
//
// Cross-checks the layer-roster invariants that are currently maintained BY HAND
// across several files with zero validation, where every failure mode is silent:
// a layer listed in dev/layers.ts but missing from dev/package.json never gets a
// node_modules symlink, so Nuxt's extends: no-ops it at boot with no error; a pkg
// name that doesn't match the layer's own package.json surfaces only as a runtime
// resolution failure far from the cause.
//
// ERRORS (exit 1) are unambiguous roster breakage. WARNINGS (exit 0) are real
// smells that need a deliberate fix — surfaced loudly with the remedy so they
// don't rot. The check logic reads the assembled catalog (scripts/catalog.ts),
// so it shares its source of truth with any future CI lint / distro generator.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assembleCatalog,
  loadRoster,
  loadWorkspaces,
  readJson,
  scanLayerDirs,
  type Catalog
} from './catalog.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const errors: string[] = []
const warnings: string[] = []
const infos: string[] = []
const err = (m: string) => errors.push(m)
const warn = (m: string) => warnings.push(m)
const info = (m: string) => infos.push(m)

const rel = (p: string) => relative(repoRoot, p) || '.'

// ---------------------------------------------------------------------------
// Source-file helpers (escape-import + alias-provider scans)
// ---------------------------------------------------------------------------

const SOURCE_EXT = /\.(ts|tsx|mts|cts|vue|mjs|js)$/
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist', 'coverage', 'playwright-report'])

function* walkSource(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walkSource(p)
    else if (SOURCE_EXT.test(name)) yield p
  }
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g

function importsOf(content: string): string[] {
  const specs: string[] = []
  let m: RegExpExecArray | null
  while ((m = IMPORT_RE.exec(content)) !== null) specs.push(m[1])
  return specs
}

const ALIAS_PREFIXES = ['#core', '#permissions', '#tenant', '#email']

// '@nuxtinator/core/test-helpers' → '@nuxtinator/core'
function pkgOfSpecifier(spec: string): string {
  const [scope, name] = spec.split('/')
  return `${scope}/${name}`
}

function resolvesFrom(spec: string, importer: string): boolean {
  try {
    import.meta.resolve(spec, pathToFileURL(importer).href)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkRosterIntegrity(catalog: Catalog, devDeps: Record<string, string>, repoWorkspaces: string[]) {
  const rosterPkgs = new Set(catalog.roster.map((r) => r.pkg))

  // E1 — every roster pkg resolves to a workspace whose package.json name matches.
  for (const layer of catalog.layers) {
    if (layer.declaredName === layer.pkg) continue
    // Try to locate the layer dir by id to give a precise typo/mismatch message.
    const guess = [join('layers', layer.id), join('layers', 'apps', layer.id)]
      .map((d) => resolve(repoRoot, d))
      .find((d) => existsSync(join(d, 'package.json')))
    if (guess) {
      const realName = readJson(join(guess, 'package.json')).name
      err(`roster '${layer.id}': dev/layers.ts pkg is '${layer.pkg}', but ${rel(guess)}/package.json name is '${String(realName)}' — they must match (extends: resolves by name).`)
    } else {
      err(`roster '${layer.id}': no workspace package.json declares name '${layer.pkg}'. extends: will fail to resolve it.`)
    }
  }

  // E2 — bidirectional bijection: dev/layers.ts pkg <-> dev/package.json @nuxtinator dep.
  for (const r of catalog.roster) {
    if (!(r.pkg in devDeps)) {
      err(`roster '${r.id}': dev/layers.ts lists '${r.pkg}' but dev/package.json has no dependency on it. bun won't symlink it and Nuxt's extends: will silently load nothing — add "${r.pkg}": "workspace:*" to dev/package.json.`)
    }
  }
  for (const dep of Object.keys(devDeps)) {
    if (!dep.startsWith('@nuxtinator/')) continue
    if (!rosterPkgs.has(dep)) {
      err(`dev/package.json depends on '${dep}' but it's not in dev/layers.ts LAYERS — either add it to the roster or drop the dependency.`)
    }
  }

  // E3 — every roster layer dir must be a declared workspace.
  for (const layer of catalog.layers) {
    if (layer.dir && !repoWorkspaces.some((ws) => resolve(repoRoot, ws) === layer.dir)) {
      err(`roster '${layer.id}': ${rel(layer.dir)} is not listed in the root package.json workspaces[] — bun won't treat it as a workspace member.`)
    }
  }

  // E4 — load order: core first; tenancy (if loaded) second.
  const coreIdx = catalog.roster.findIndex((r) => r.pkg === '@nuxtinator/core')
  if (coreIdx !== 0) {
    err(`load order: @nuxtinator/core must be first in dev/layers.ts (found at index ${coreIdx}). Core is the lowest-priority foundation.`)
  }
  const tenancyIdx = catalog.roster.findIndex((r) => r.pkg === '@nuxtinator/tenancy')
  if (tenancyIdx !== -1 && tenancyIdx !== 1) {
    err(`load order: @nuxtinator/tenancy must be second (found at index ${tenancyIdx}) so its multi-mode #tenant kernel overrides core's single-mode one.`)
  }

  // Info — workspaces that are layers but aren't in the dev roster (legitimately
  // compiled out, but worth surfacing so a forgotten layer is visible).
  const workspaceLayerNames = [...catalog.byName.keys()].filter((n) => n.startsWith('@nuxtinator/'))
  for (const name of workspaceLayerNames) {
    if (!rosterPkgs.has(name)) {
      info(`workspace layer '${name}' exists but is not in dev/layers.ts — it is compiled out of the dev host (fine if intentional).`)
    }
  }
}

function checkOrphans(catalog: Catalog) {
  const workspaceDirs = new Set([...catalog.byName.values()].map((w) => w.dir))
  for (const dir of scanLayerDirs(repoRoot)) {
    if (workspaceDirs.has(dir)) continue
    const hasPkg = existsSync(join(dir, 'package.json'))
    warn(`orphan dir ${rel(dir)} looks like a layer but is not a workspace member${hasPkg ? '' : ' (no package.json)'}. Adopt it (add package.json + roster entries) or remove it. If WIP, ignore.`)
  }
}

function checkCrossLayerImports(catalog: Catalog) {
  const layerDirs = catalog.layers
    .filter((l) => l.dir)
    .map((l) => ({ id: l.id, pkg: l.pkg, dir: l.dir as string, requires: l.requires }))

  const dirToLayer = (p: string) =>
    layerDirs.find((l) => p === l.dir || p.startsWith(l.dir + sep))

  for (const layer of layerDirs) {
    let usesCoreAlias = false
    for (const file of walkSource(layer.dir)) {
      const specs = importsOf(readFileSync(file, 'utf8'))
      for (const spec of specs) {
        // Alias usage (provider-declared check).
        if (ALIAS_PREFIXES.some((a) => spec === a || spec.startsWith(a + '/'))) {
          usesCoreAlias = true
        }
        // Cross-layer package imports: must resolve, and must be declared.
        // Both failure modes are silent — an unresolvable specifier only shows
        // up when something actually imports the file (a whole test suite once
        // sat dead on `layer-core/test-helpers`), and an undeclared one works
        // in this monorepo purely because the hoisted linker put the package at
        // the root, then breaks the moment the layer is fetched standalone.
        if (spec.startsWith('@nuxtinator/') && layer.pkg !== pkgOfSpecifier(spec)) {
          const dep = pkgOfSpecifier(spec)
          if (!resolvesFrom(spec, file)) {
            err(`'${layer.id}' imports '${spec}' in ${rel(file)} — that specifier does not resolve. Check the package name and its exports map.`)
          } else if (!layer.requires.includes(dep)) {
            err(`'${layer.id}' imports '${spec}' in ${rel(file)} but does not declare '${dep}' — add it to optionalDependencies. It resolves here only because the hoisted linker put it at the repo root.`)
          }
        }
        // Relative import escaping this layer's own directory.
        if (!spec.startsWith('.')) continue
        const resolved = resolve(dirname(file), spec)
        if (resolved === layer.dir || resolved.startsWith(layer.dir + sep)) continue
        const target = dirToLayer(resolved)
        const targetLabel = target ? `layer '${target.id}'` : rel(resolved)
        const alias = target?.pkg === '@nuxtinator/core' ? ' (use a #core/* import instead)' : ''
        err(`'${layer.id}' imports '${spec}' in ${rel(file)} — a relative path escaping the layer into ${targetLabel}. This breaks when the layer is fetched standalone (prod's flat _layers/ layout)${alias}.`)
      }
    }
    // W3 — alias use without declaring the provider (core ships the fallback for all four aliases).
    if (usesCoreAlias && !layer.requires.includes('@nuxtinator/core') && layer.pkg !== '@nuxtinator/core') {
      warn(`'${layer.id}' imports a #core/#tenant/#email/#permissions alias but does not declare '@nuxtinator/core' in its dependencies — add it to optionalDependencies.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const rootPkg = readJson(join(repoRoot, 'package.json'))
  const workspaces = Array.isArray(rootPkg.workspaces) ? (rootPkg.workspaces as string[]) : []
  const devPkg = readJson(join(repoRoot, 'dev', 'package.json'))
  const devDeps = (devPkg.dependencies ?? {}) as Record<string, string>

  const roster = await loadRoster(join(repoRoot, 'dev', 'layers.ts'))
  const byName = loadWorkspaces(repoRoot, workspaces)
  const catalog = assembleCatalog(roster, byName)

  checkRosterIntegrity(catalog, devDeps, workspaces)
  checkOrphans(catalog)
  checkCrossLayerImports(catalog)

  console.log(`\nverify-layers — ${catalog.roster.length} layers in dev/layers.ts\n`)

  if (infos.length) {
    for (const m of infos) console.log(`  i  ${m}`)
    console.log('')
  }
  if (warnings.length) {
    for (const m of warnings) console.log(`  ⚠  ${m}`)
    console.log('')
  }
  if (errors.length) {
    for (const m of errors) console.log(`  ✗  ${m}`)
    console.log('')
  }

  if (errors.length) {
    console.log(`✗ ${errors.length} error(s), ${warnings.length} warning(s). Roster is inconsistent.\n`)
    process.exit(1)
  }
  console.log(`✓ roster consistent — 0 errors, ${warnings.length} warning(s).\n`)
}

main().catch((e) => {
  console.error('verify-layers crashed:', e)
  process.exit(2)
})
