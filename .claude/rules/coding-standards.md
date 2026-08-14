# Coding standards

**These are strict rules, not guidelines.**

Every commit must comply with every rule. No PR may be merged with any standards
failure — **even if the failure appears to be pre-existing**. If a check fails on your
PR, or you touch code that violates a rule, fixing it is part of your PR. We have a
strict don't-pass-the-buck policy.

Referenced by the `implement-github-issue` and `review` skills and the `developer` and
`reviewer` agents. Architecture and layer wiring live in [CLAUDE.md](../../CLAUDE.md) —
this file is about code quality. Rules are intentionally minimal; add new ones here as
they're decided, and keep them concise.

## 0. The floor

Every feature meets the org-wide core standards regardless of size or finish:
error handling, authentication, authorization, input validation, secrets handling, and a
stated security posture. These don't scale with the size of the change — a one-day
utility meets them as fully as a platform.

Full text lives in the **`software-standards` repo**, at
`content/standards/core-standards.md` — a separate checkout, so locate it rather than
assuming a path from here.

The three that bite hardest in this codebase:

- **Auth and authz are enforced on the server, never the client.** Hiding a rail tile,
  a nav item, or a button is decoration. Every server route goes through
  `defineTenantHandler` / `requireAuth` / `requireOperatorAdmin` and independently
  validates the action.
- **Tenant isolation is authorization.** Org A cannot reach org B's data through any
  path. The *query* is the boundary, not a filter applied on top of it — which is why
  RLS + the `app.current_org` GUC do the work and application-layer filtering doesn't
  count. Any use of `adminDb` outside the tenancy layer is a contract violation.
- **No silent crashes, no swallowed errors.** Every error has a destination. Logging it
  and continuing is not handling it. Failures preserve invariants — a transaction
  completes or rolls back.

## 1. TypeScript

- Strict mode, always. **Never weaken compiler or lint config to make an error go away** —
  that's a serious finding, worse than the error it hides.
- `any` is banned, explicit or implicit. Use `unknown` plus a type guard.
- No `@ts-ignore`. `@ts-expect-error` only with a comment justifying it.
- `bun run typecheck` and `bun run lint` pass with **zero errors and zero warnings**.

## 2. Components

- **Search every loaded layer before creating anything.** If a component already exists
  in `layers/core`, any nuxtinator layer (`tenancy`, `ai`, `oauth`, `dev`, …), or any app
  layer (`layers/apps/*`), **use it** — do not hand-roll a local equivalent. Components
  are auto-imported across layers, so an existing one is already available to you; you
  just have to look. A near-duplicate is a finding, not a style preference.
  - Doesn't quite fit? **Extend the existing component** (a prop, a slot) and update its
    callers, per §3. Forking it into a private copy is the violation — that's how one
    button becomes nine that drift apart.
  - Genuinely new and reusable → put it in `layers/core` so the next layer finds it.
    App-specific → `layers/apps/<id>`. Getting this split wrong is an architecture
    violation.
- Prefer Nuxt UI components over hand-rolled equivalents. The order is: existing layer
  component → Nuxt UI → extend one of those → build new.
- `<script setup>` + typed `defineProps<T>()`, `defineEmits<T>()`, `defineSlots<T>()`.
- **Presentational components receive everything through props and slots.** No data
  fetching, no `useFetch`, no route awareness inside them. That wiring lives in pages
  and layouts.
- Named for **what they are, not where they're used**, and multi-word. Bad:
  `MessagesPageHeader.vue` (usage-specific), `Header.vue` (single word). Good:
  `ThreadHeader.vue`. Nuxt's ESLint preset turns `vue/multi-word-component-names` off,
  so this one is on the reviewer to catch, not the linter.
- App-id prefix everything — components, composables, routes, tables, permissions.

## 3. Changes to core and shared layers

Core is extended by every layer and every host. A change there ripples.

1. **Know the blast radius** before editing — who extends this, who imports this alias.
2. Maintain backward compatibility where possible. A breaking change to a host-facing
   contract (an alias, a composable, a registry signature) is a **major** version bump —
   see the `release-layer` skill.
3. **Update every dependent in the same PR.** Never leave a layer or the dev host broken.
4. Verify with a full `bun run build` from `dev/`, not just the layer you touched.

## 4. Testing

Aligned with the org standard — the `software-standards` repo, §Test coverage in
`content/review/implementation-review.md`. **Evidence over assertion**: "auth is handled"
is not a pass; "enforced at `<file>`, covered by the test at `<file>`" is.

- Every feature is covered at the appropriate layer. Tests live in `layers/<layer>/tests/`
  (unit + API) and `tests/e2e/` (Playwright, real browser flows).
- **Cover the error paths, not just the happy path.** A unit test that only walks the
  success case is half a test. Invalid input, missing permission, absent record, failed
  dependency — each is a case.
- **Critical journeys get e2e coverage that exercises the real stack.** Not a mock of the
  journey — the actual server, the actual database.
- **Assertions check behavior, not execution.** Coverage that only proves a line ran is
  gamed coverage. Assert the outcome the user or caller depends on.
- **Nothing skipped, nothing `.only`.** A test that doesn't run in CI is not coverage,
  and a flaky test is a failing test — fix it or delete it, never retry around it.
- **A regression test must be proven to fail without the fix.** Write it, then break the
  thing it guards — revert the line — and watch it go red. A test that passes either way
  is worse than no test: it reports coverage that doesn't exist.
  - If it still passes, you've learned something and must act on it: either the assertion
    is too weak, or the behavior you were guarding doesn't work the way you assumed.
    Both are findings; neither is a reason to keep the test and move on.
- Select elements by role, structure, or `data-testid` — never by user-facing copy. A
  test that breaks when someone rewords a button is a broken test.
- **Tenancy-sensitive features need a cross-org negative test.** Org B must be *proven*
  unable to read org A's rows — spot-check the actual query, don't trust the filter above
  it. This is the §0 isolation rule stated as evidence.
- **Failure modes are tested, not just implemented.** What happens when the dependency is
  down, and are retries idempotent — does a replay double-send, double-charge, or
  duplicate a row?

## 5. Database and migrations

Postgres via Kysely. Architecture is in [CLAUDE.md](../../CLAUDE.md); these are the rules
a review enforces.

- **Every migration exports `up` *and* a real `down`** that reverses it, and both are
  tested. `down` drops in the reverse order of `up` — see
  `layers/apps/messages/migrations/messages_T001_enable_tenancy.ts`.
- **Migrations run on every boot** via core's Nitro plugin, so a broken one breaks the
  dev server for everyone, not just the test suite.
- **Filenames are globally unique across host + all layers** — they share one namespace:
  - `<appId>_NNN_<description>.ts` — regular
  - `<appId>_T<NNN>_<description>.ts` — per-app tenancy retrofit, only run when the
    tenancy layer is loaded
- **A new tenant-scoped table needs its `_T<NNN>_` retrofit in the same PR.** A table
  that exists without `org_id` + RLS is a cross-tenant data leak waiting for a
  multi-tenant deploy. Use the inlined `enableTenantScoping` / `disableTenantScoping`
  helpers — inlined per migration on purpose, because aliases don't resolve at
  migration-load time. Never import them.
- **Table and column conventions**: tables prefixed `<appId>_`; `id uuid` primary key
  defaulting to `gen_random_uuid()`; `timestamptz NOT NULL DEFAULT now()` for timestamps;
  foreign keys carry an explicit `ON DELETE` rule.
- **Schema types ship with the migration.** Add the table to the layer's
  `server/database/schema.d.ts`, merging into `NuxtinatorDatabaseTables` — use
  `Generated<T>` for defaulted columns and `ColumnType<…>` for timestamps. A migration
  without its type augmentation is half a change.
- Layer code imports `db` from `#core/server/utils/database`. **Only the tenancy layer
  touches `adminDb`** (`#tenant/admin-db`) — BYPASSRLS from anywhere else is a tenancy
  contract violation, and one of the few things that is always a hard fail.
- **Ship production-ready or don't ship.** If existing data needs migrating, migrate it
  now. Deferring it blocks a clean release.
- **Seeds alone are never enough when production data exists.** A seed change without the
  paired migration is a finding, every time.

## 6. Module organization

[CLAUDE.md](../../CLAUDE.md) documents the layer architecture — aliases, the six
registries, `defineSettings`, the `#tenant` kernel, page path shapes. Don't restate it;
this section is only the rules that make a review fail.

- **Use the established pattern instead of hand-rolling its equivalent.** Each of these
  exists precisely so there's one of it — a second implementation is a finding even when
  it works:
  - contributing permissions, nav, tiles, roles, admin sections → the **registries**,
    via the layer's Nitro plugin
  - defaults merged with DB overrides → **`defineSettings`**, never an inline merge in
    an endpoint
  - user identity / org context in a route → **`defineTenantHandler`** from
    `#tenant/server`
- **The §2 reuse rule covers composables, server utils, and types too.** They're
  auto-imported or aliased (`#core/...`, `#tenant`, `#email`) across every loaded layer.
  Reach for the alias rather than a local reimplementation.
- **Cross-layer imports go through the alias, never a relative path.** A `../../` into
  another layer breaks the moment that layer arrives from npm or giget instead of a
  workspace symlink.
- **Domain language over low-level detail.** Express intent — `userService.search()`, not
  a query builder inlined at the call site.
- **Permissions are granular, and both stores are updated together** — the compile-time
  `#permissions` augmentation and the runtime `registerPermissions` call. One without the
  other is a half-registered permission that type-checks and then fails at runtime.

## 7. No provenance metadata in files

**Git is the record of who and when. Don't keep a second copy in the files.** Names,
dates, and ticket refs in source go stale silently, nothing verifies them, and they
answer a question `git blame` already answers exactly — while displacing the one the
reader actually has: *why is the code like this?*

Each rule has the same escape hatch: it's fine when it **is** the subject matter or a
tool requires it. Test: would removing it lose real information?

- **No names of individuals** — not `// per <name>`, not `<name>'s parser`, not
  `@author`, not in fixture data. State the *reason* the name was standing in for.
  Never route questions through a person (`// ask <name> why this is 30s`) — that's a
  missing explanation wearing a name.
- **No dates** — not `decided 2026-07`, not `as of March`, not `@since`. Write the
  durable claim and delete it when it changes. In scope: `compatibilityDate` in
  `nuxt.config.ts` is a functional value.
- **No ticket references.** One exception: tracking an open bug or a workaround for an
  unfinished feature — and only where the comment explains itself without the reference.
  `// fix for ABC-123` as the whole explanation is a violation.

## 8. Theming

- **No color literal in layer or host source** — no hex, `rgb()`, `hsl()`, or arbitrary
  Tailwind value (`bg-[#0b3d2e]`) in a component, page, or layout. Color comes from the
  theme via semantic Nuxt UI classes.
- **No font family named in a component.** Configured once.
- **Both themes or neither.** A component may not be styled so it only works in light or
  only in dark. Contrast is a requirement in both.
- A value the theme doesn't cover is a question, not a judgment call. Picking one inline
  is how a palette becomes eleven greys nobody chose.

## 9. Responsive

- **Mobile-first.** Unprefixed Tailwind utilities are the mobile layout; larger sizes
  layer on with `md:` / `lg:` / `xl:`. Never write a desktop layout in the base and undo
  it with a prefix, and no `max-*` variants walking a desktop design backwards.
- Breakpoint prefixes must be **literal class names** — never built by concatenation or
  interpolation. Tailwind scans source text and won't emit a class it can't see. This is
  a bug, not a style nit.
- Every page works at every supported size: no horizontal overflow, no clipped or
  overlapping content, tap targets reachable on touch.

<!-- TODO: define the supported form-factor list + viewports as a single source of truth, like crossway's shared/utils/form-factors.ts -->

## Enforcement

Run from `dev/`. All must pass before a commit is considered done. CI runs the same
three groups on every PR (`.github/workflows/ci.yml`) — local green and CI red is still
red.

| Check | Command | Prerequisites |
| --- | --- | --- |
| Lint | `bun run lint` | — |
| Types | `bun run typecheck` | — |
| Layer wiring | `bun run verify-layers` | — |
| Tests | `bun run test` | `../scripts/setup-test-db.sh`, `../scripts/setup-test-s3.sh`, Mailpit on 1025/8025 |
| E2E | `bun run test:e2e` | same as Tests, plus `bunx playwright install chromium` |
| Build | `bun run build` | required for any core/shared-layer change |

**Mailpit, not MailHog.** The helpers speak Mailpit's v1 HTTP API; MailHog answers on the
same ports and 404s every mail assertion, which reads as a broken feature rather than a
broken container.

**`bun run lint` currently covers only `dev/` — 7 files.** ESLint's base path is the host,
so no layer code and no test code is linted at all. A green "Lint & types" check is
therefore *not* evidence that changed layer code is clean; until this is fixed, layer
style and correctness are the reviewer's job to read for. Tracked in issue #7.

**A passing test count is not proof the suite ran.** Vitest reports an unresolvable import
as `0/0 passed` rather than as an error, so a suite that is entirely broken looks merely
empty. Check the count is what you expect, not just that it's green.
