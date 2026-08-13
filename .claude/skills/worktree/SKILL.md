---
name: worktree
description: Set up and tear down the git worktrees used for parallel feature work — branch a new worktree from latest master with its own ports and env, and retire worktrees whose PR has merged. Use when starting any new unit of work, and after a PR merges to clean up.
---

# Worktrees

Feature work happens in worktrees under `worktrees/<name>/` (gitignored); the parent
checkout stays on `master` and stays clean. A worktree exists exactly as long as its
branch has unfinished business.

Several worktrees run at once, so **every worktree gets its own ports and its own
databases**. Two checkouts sharing either will corrupt each other's results in ways that
look like code bugs.

## Setting up a new worktree

1. **Sweep for retired worktrees first** (see below) — setup time is when stale ones get
   noticed, and slots get freed.

2. **Fetch, and branch from `origin/master`, not local `master`.** The parent's local ref
   is a trap: a dirty parent makes `git pull` abort, and when output is trimmed
   (`| tail`) the abort is invisible — the worktree silently branches from a stale tip
   and surfaces later as CI-only failures against code the branch has never seen.

   ```bash
   git fetch origin
   git worktree add worktrees/<name> -b <branch> origin/master
   ```

   Confirm: `git -C worktrees/<name> rev-parse HEAD` must equal
   `git rev-parse origin/master`. If the parent checkout is dirty, say so — those changes
   belong to someone. Never stash or discard them to make a pull work.

3. **Derive the port slot — don't search for a free one.** Slot `N = (issue number % 8) + 1`,
   or for ad-hoc work, any free `N` in 1–8.

   **Deriving beats scanning.** "Lowest slot not currently in use" looks fine and races:
   two agents starting at once both read the same state, both see slot 1 free, and both
   take it — same dev port, same test database, cross-contaminated results that reproduce
   nowhere. A slot derived from the issue number needs no coordination at all.

   | | Parent | Slot 1 | Slot 2 |
   | --- | --- | --- | --- |
   | Dev server (`NUXT_PORT`) | 2080 | 2180 | 2280 |
   | Playwright (`TEST_BASE_URL`) | 2090 | 2190 | 2290 |
   | Test database | `go_saas_test` | `go_saas_test_1` | `go_saas_test_2` |

   Formula: dev `2080 + N*100`, e2e `2090 + N*100`. A block of 100 per slot leaves room.

   Two open issues can land on the same slot (they're congruent mod 8). Check whether
   another worktree already has it (`grep NUXT_PORT worktrees/*/dev/.env`); if so, take
   the next free slot. That check is a fallback, not the primary mechanism.

4. **Copy and rewrite the env.** `.env` is gitignored, so a fresh worktree has none and
   nothing runs. Copy the parent's, then rewrite everything that carries a port or a
   database name:

   ```bash
   cp dev/.env worktrees/<name>/dev/.env
   ```

   In the copy, set for slot `N`:
   - `NUXT_PORT` → the slot's dev port
   - `NUXT_PUBLIC_SITE_URL` → `http://localhost:<dev port>` — **must stay in sync with
     `NUXT_PORT`**; a stale value breaks auth callbacks and email links in ways that
     don't look port-related.
   - `TEST_BASE_URL` → `http://localhost:<e2e port>`
   - `DATABASE_URL` → its own database (see below)
   - `TEST_DATABASE_URL` / `TEST_APP_DATABASE_URL` → their own test database

5. **Give the worktree its own databases.** Both matter:
   - **Dev DB** — migrations run on boot via core's Nitro plugin. A branch with a new
     migration will apply it to whatever DB it points at; if that's the shared dev DB,
     the parent checkout is now running old code against a migrated schema.
   - **Test DB** — `bun run test:e2e` truncates and seeds. Two worktrees testing against
     one database produce failures that reproduce nowhere.

   `scripts/setup-test-db.sh` reads `TEST_DB_NAME`, so provisioning a slot's own database
   is one command (it's idempotent, and the roles are shared):

   ```bash
   TEST_DB_NAME=go_saas_test_<N> ./scripts/setup-test-db.sh
   ```

   It prints the two connection strings to paste into the worktree's `.env`. Give the dev
   DB the same treatment — `createdb apps_<N>` — and point `DATABASE_URL` at it.

6. **`bun install` in the worktree** — `node_modules` is per-checkout, and this is a bun
   workspace, so nothing resolves until it's run there.

7. **Verify before building on it**: `bun run verify-layers`, then start the dev server
   and confirm it reports the slot's port.

If `master` moves while work is in flight, rebase the worktree branch onto it sooner
rather than later.

## Working inside a worktree

- **Pass the repo explicitly to every git command: `git -C <absolute-path> …`.** Working-
  directory drift doesn't only corrupt what you read, it redirects what you *write* — a
  bare `git mv` meant for a worktree lands in the parent, staging a rename on `master`
  that nothing in the output distinguishes from success.
- **The shell's working directory drifts between tool calls.** Before interpreting any
  surprising test, build, or git output, run `pwd` and `git log --oneline -1`. If HEAD
  isn't your branch, `cd` back with an absolute path and rerun rather than debugging a
  phantom regression.
- **Confirm which checkout owns a port before trusting what renders there** — check the
  process path in `ps`, don't assume.
- **Never write a repo-relative path to anything outside the repo.** Worktrees sit two
  levels below the root, so such a path resolves to nothing here — and the failure mode
  is silent absence, not an error.

## Tearing down a retired worktree

A worktree is **retired** when all three hold:

- its branch has a PR (`gh pr list --head <branch> --state all`),
- that PR is merged, and
- it has no local changes (`git -C worktrees/<name> status --porcelain`; gitignored
  artifacts like `node_modules/` or `test-results/` don't count).

```bash
git worktree remove worktrees/<name>          # --force if only ignored artifacts remain
git branch -D <branch>
```

`-D` not `-d`: squash-merged branches never look merged to git — the merged PR, verified
above, is the authority. A worktree with an **open** PR or local changes is never a
teardown candidate, no matter how old.

**Ask the user before removing any worktree you did not create in this session** —
removal deletes the directory and the local branch.

Drop the slot's test database on the way out so the slot is genuinely free.

When a PR merges mid-session, tear its worktree down as part of wrapping up rather than
leaving it for the next sweep.
