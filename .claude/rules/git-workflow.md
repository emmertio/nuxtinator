# Git workflow (fork that contributes upstream)

`origin` = `emmertio/nuxtinator`. `upstream` = `corsacca/nuxtinator`.

| Branch | Invariant |
| --- | --- |
| `master` | Exact mirror of `upstream/master`. Nothing of ours, ever. Fast-forward only. |
| `develop` | `master` + our deltas. What we run. Changes by PR only. |
| `feature/*` | One unit of work, short-lived, rebase freely. |

## Where a branch starts decides where it can go

- **Upstream-bound → cut from `master`.** PR to `corsacca/nuxtinator`. Merge into
  `develop` too if we need it before they accept.
- **Fork-only → cut from `develop`.** PR to `develop`. For our tooling, conventions, and
  anything upstream won't take or hasn't yet.
- **Never merge `develop` into an upstream-bound branch** — one merge turns a clean
  contribution into an unreviewable one carrying every delta we hold.
- Unsure? Default to upstream. A rejected PR costs one conversation; a fork-local change
  that should have been upstreamed costs a conflict on every sync, forever.

## Contribute

```bash
git fetch upstream
git checkout -b feature/<thing> upstream/master
git rebase upstream/master                    # again, right before opening
gh pr create --repo corsacca/nuxtinator --base master
```

**Small and single-purpose.** They take most of what we send — that's a reason to send
well-shaped changes, not big ones. Five focused PRs get four merges and one discussion;
one 78-file PR stalls. Partial approval only works if the parts are separable.

## Sync down (weekly, not monthly — drift costs more than linearly)

```bash
git fetch upstream
git checkout master && git merge --ff-only upstream/master && git push origin master
git checkout develop && git rebase master && git push --force-with-lease origin develop
```

Rebase, never merge `master` into `develop` — it keeps our deltas as a legible stack of
"here's what we add". If `--ff-only` fails, something got committed to `master`; fix that
rather than merging past it.

**After upstream squash-merges us**, their one commit equals our N, and git sees the same
change twice — the rebase conflicts against our own work and reads as nonsense. Drop our
originals instead of resolving:

```bash
git rebase --onto master <last-upstreamed-commit> develop
git diff master develop      # should show only deltas we still expect to carry
```

Cheaper still: ask for a rebase-merge instead of a squash. Commit identity survives, our
rebase drops them automatically, and this whole class of conflict disappears.

## Two traps

**Never force-push `develop`.** Agents branch from it; rewriting it invalidates their base
with no error to notice. The sync rebase above is the one deliberate exception.

**Release tags share one namespace with upstream** — 22 `@nuxtinator/<id>@x.y.z` tags
exist, all theirs. If we cut `@nuxtinator/core@1.3.0` and they independently cut a
different one, which code a consumer gets depends on which remote they fetched. So fork
releases carry a prerelease suffix — `1.3.0-emmertio.1` — which sorts below `1.3.0`, can't
collide, and is visible in a lockfile. Plain `x.y.z` belongs to upstream.

## FORK-DELTA.md

One line per thing `develop` carries that `master` doesn't: what, why, and status (PR'd
and pending / rejected / deliberately fork-only). `git diff master develop` shows *what*
differs and never *why*, or whether someone already tried to upstream it.
