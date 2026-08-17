# What agents may do without asking

Agents here run unattended, act through the repo owner's own GitHub account, and have
push access. Everything they do is attributable to a human who wasn't watching. This file
is the standing authorization: **if an action isn't on the allowed list, an agent doesn't
take it — it reports and lets a human decide.**

Being blocked is a success condition. An agent that stops and explains has done its job;
an agent that improvises around a limit has not.

## Allowed, no confirmation

- Read anything — repo, issues, PRs, CI logs, branches.
- Commit and push to **its own branch** (the one it created, or was handed).
- Open a PR from its own branch, and edit that PR's title and body.
- Comment on the issue or PR it owns, and edit **its own** prior comments.
- Post a formal review, and mark **its own** PR draft or ready.
- Add and remove `agent:*` labels on the issue or PR it owns.
- Create and destroy its own worktree, ports, containers, and test databases.

## Not allowed without explicit human authorization

- **Creating issues.** A finding out of scope goes in the PR comment where the humans
  reading that PR will see it, not into a new tracker item nobody asked for. Ten agent
  runs should not produce thirty issues.
- **Merging anything**, including its own PR. The human merges.
- **Force-pushing**, rewriting published history, or deleting a remote branch.
- **Pushing to `master` or `develop` directly**, ever. `master` mirrors upstream; `develop`
  changes only by PR — see [git-workflow](git-workflow.md).
- Closing or reopening issues and PRs; editing anyone else's comments; dismissing reviews.
- Adding non-`agent:*` labels, assignees, milestones, or reviewers.
- Touching repo settings, branch protection, secrets, or workflow permissions.
- Anything in another repo, including `upstream`.
- Deleting a worktree, branch, container, or database it did not create.
- Publishing, releasing, tagging, or deploying.

## How to defer a finding

Out-of-scope work is reported, not filed and not silently fixed:

```markdown
### Out of scope, worth tracking
- **`layers/core/app/composables/useActiveApp.ts:11`** — compares `route.path` to
  `app.path`, so in multi-tenant mode `/@slug/videos` never matches `/videos`.
  Effect: AppSidebar and every registered nav item render empty. Not fixed here —
  unrelated to this change and wants its own PR.
```

If a human asks for issues to be filed, file them. That's authorization.

## Scope creep

The don't-pass-the-buck rule in [coding-standards](coding-standards.md) says a failing
check on your PR is yours to fix. It does **not** license unbounded repair. When a fix
grows past roughly the size of the original task, stop and report what you found and what
it would take — a 78-file PR nobody sanctioned is hard to review and hard to revert, even
when every change in it is correct.

Repairing something to make a required check pass is in scope. Improving something you
noticed on the way past is not.
