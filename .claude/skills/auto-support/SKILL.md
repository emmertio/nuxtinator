---
name: auto-support
description: Watch GitHub issues and PRs on this repo and hand each one to a developer agent automatically. Use when asked to "turn on auto support", "watch the repo", "auto-triage incoming issues/PRs". Runs continuously.
---

# auto-support

Subscribe to repo activity and delegate it to `developer` agents. You are the dispatcher:
you **never write code**, never commit, never comment on the substance of a change. You
route work and you track ownership.

**Repo:** `emmertio/nuxtinator` (`origin`). Pass `--repo emmertio/nuxtinator` to every
`gh` command — this checkout also has an `upstream` remote (`corsacca/nuxtinator`) and a
bare `gh` call is ambiguous.

## Before the first tick

1. **You must be driven by a scheduler.** This skill polls once per invocation and then
   the turn ends. Run it under `/loop` (or call `ScheduleWakeup` at the end of each tick,
   ~300s). Invoking it once without a driver does one pass and stops — that is the single
   most likely reason "auto-support isn't doing anything."
2. **Ensure the state labels exist** (idempotent, safe to re-run):

   ```bash
   gh label create agent:auto     --repo emmertio/nuxtinator --color 0e8a16 --description "Opt in: agents may work this" 2>/dev/null || true
   gh label create agent:working  --repo emmertio/nuxtinator --color fbca04 --description "A developer agent owns this" 2>/dev/null || true
   gh label create agent:blocked  --repo emmertio/nuxtinator --color d93f0b --description "Needs a human" 2>/dev/null || true
   ```

## State lives on GitHub, never in your context

Your context is not durable — it compacts, the session ends, the machine sleeps. If
ownership is tracked in your head, the next tick re-delegates everything and you get
duplicate branches, duplicate worktrees, and duplicate PRs for one issue.

**Labels are the state machine.** They survive restarts, they're visible to humans, and
they're atomic enough to claim with.

| State | Meaning | Who sets it |
| --- | --- | --- |
| `agent:auto` | Human opted this in. Nothing has claimed it. | human |
| `agent:working` | A developer owns it. **Hands off.** | you, at claim time |
| `agent:blocked` | Needs a human. Do not re-delegate. | developer / reviewer |
| *(no label)* | Not yours. Ignore it entirely. | — |

**Claim before you spawn.** Add `agent:working` *first*, confirm it stuck, then spawn.
Spawning first and labelling after leaves a window where the next tick sees an unclaimed
issue and delegates it twice.

## Agent-authored comments are marked, and you must skip them

Every comment our agents post carries a marker footer — see
[github-comments](../../rules/github-comments.md). Agents post through the repo owner's
own account, so **author login cannot tell you whether a comment came from a human or
from one of our agents.** The marker is the only signal.

**Any comment containing `<!-- agent:` is ours — never treat it as input.** Without this
check the reviewer's findings look like new human feedback, you delegate them to a second
developer, and two agents commit to one branch while the owning developer is already
fixing exactly those findings.

Your own comments carry `<!-- agent:auto-support -->` and the disclaimer, same as everyone
else's.

## The tick

### 1. Issues

```bash
gh issue list --repo emmertio/nuxtinator --label agent:auto --state open --json number,title,labels,assignees
```

Delegate an issue only when **all** hold:

- it has `agent:auto`
- it does **not** have `agent:working` or `agent:blocked`
- it has no human assignee
- you are under the concurrency cap (below)

Then: add `agent:working`, and spawn a background `developer` agent with the issue number.

### 2. PRs

```bash
gh pr list --repo emmertio/nuxtinator --state open --json number,isDraft,headRefName,labels,mergeable
```

**A PR whose issue is `agent:working` belongs to its developer — skip it.** That agent is
already running its own review loop. Touching it double-commits to one branch.

You act on a PR only when it is **orphaned or has genuinely new human input**:

- its owning developer has finished or died (no `agent:working` on the linked issue), and
- it has a human comment, review, or requested change newer than the last agent activity
  — i.e. a comment with **no** `<!-- agent:` marker, or
- it is `mergeable: CONFLICTING`

Then re-delegate: re-add `agent:working` to the linked issue, spawn a `developer` with the
PR number and the specific input to address.

### 3. Terminal states — stop watching

- PR **merged** → remove `agent:working`, done.
- PR **ready for review** (not draft) with no new human input → the reviewer passed it.
  It's waiting on a human. Do nothing.
- `agent:blocked` → a human must act. Do nothing. Never "retry" a blocked item.

## Limits

These exist because every developer costs a worktree, a database, a dev server, and a
reviewer subagent — and because a runaway dispatcher is expensive and hard to notice.

- **Max 2 developers at once.** Over the cap, leave the issue unclaimed; the next tick
  picks it up.
- **Never delegate the same issue or comment twice.** The `agent:working` label is what
  guarantees this across restarts — not your memory.
- **Never act on an issue or PR without `agent:auto`** on the issue. Opt-in is what keeps
  agents out of human conversations, questions, and half-scoped ideas.
- **You never push, merge, close, or force anything.** Dispatch only.

## When something goes wrong

If a developer reports failure, dies, or you find a PR that's been round-tripping without
converging: label the issue `agent:blocked`, remove `agent:working`, and post one comment
saying what's stuck and what you tried — ending with `<!-- agent:auto-support -->`. Then
leave it alone. Escalating to a human is a success condition, not a failure.

<!-- TODO: fill in — whether upstream/corsacca issues are in scope, notification/alerting on blocked items -->
