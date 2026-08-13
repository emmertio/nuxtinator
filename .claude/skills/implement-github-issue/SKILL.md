---
name: implement-github-issue
description: Implement a GitHub issue end to end — read the issue, build it in its own worktree, open a PR. Use when asked to "work issue #12", "implement this issue", "pick up <issue url>". Argument: <issue number | url>.
---

# implement-github-issue

Take a GitHub issue and turn it into merge-ready work. Every issue gets **its own
worktree, branch, and port slot** so parallel efforts never collide.

## Steps

1. Read the issue (`gh issue view <n> --comments`) — capture the acceptance criteria
   verbatim. They're the contract the `reviewer` will hold you to.
2. **Create the worktree** with the `worktree` skill: branch `issue-<n>-<slug>` off
   `origin/master`, claim a port slot, copy and rewrite `dev/.env`, provision its
   databases, `bun install`.
3. Implement, following [coding-standards](../../rules/coding-standards.md).
4. Verify **from the worktree's `dev/`, on its own ports** — never against the parent's
   dev server: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:e2e`.
5. Commit, push, open a PR linking the issue (`Closes #<n>`).
6. Gate it through the `reviewer` agent; fix and re-review until it passes.
7. Once merged, tear the worktree down per the `worktree` skill.

<!-- TODO: fill in — branch naming, PR template, when to ask vs. assume, draft-PR policy -->
