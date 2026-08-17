---
name: implement-github-issue
description: Implement a GitHub issue end to end — read the issue, build it in its own worktree, open a PR. Use when asked to "work issue #12", "implement this issue", "pick up <issue url>". Argument: <issue number | url>.
---

# implement-github-issue

Take a GitHub issue and turn it into merge-ready work. Every issue gets **its own
worktree, branch, and port slot** so parallel efforts never collide.

**Repo:** `emmertio/nuxtinator` — pass `--repo emmertio/nuxtinator` to every `gh` command.

## Steps

1. **Read the issue** — `gh issue view <n> --comments`. Capture the acceptance criteria
   **verbatim**; they're the contract the `reviewer` holds you to, and paraphrasing them
   is how a PR passes review while missing the point.

2. **Gate on scope.** If you cannot state what "done" means from the issue, stop: label it
   `agent:blocked`, comment with the specific questions, and report back. Don't guess.

3. **Claim it** — `gh issue edit <n> --add-label agent:working`. Before doing any work, so
   a second dispatcher tick can't hand the same issue to another agent.

4. **Pick the base, then create the worktree.** Per
   [git-workflow](../../rules/git-workflow.md), where the branch starts decides where it
   can go — and retrofitting is expensive:
   - fixes or improves something **upstream already owns** → base `origin/master`, and the
     PR goes to `corsacca/nuxtinator`
   - our tooling, conventions, or anything upstream won't take → base `origin/develop`
   - unsure → `origin/master`, so the option stays open

   Then use the `worktree` skill: branch `issue-<n>-<slug>` off that base, port slot
   `(<n> % 8) + 1`, copy and rewrite `dev/.env`, provision its databases, `bun install`.

5. **Implement**, following [coding-standards](../../rules/coding-standards.md).

6. **Verify from the worktree's `dev/`, on its own ports** — never against the parent's
   dev server. All four green before you open anything: `bun run lint`,
   `bun run typecheck`, `bun run test`, `bun run test:e2e`.

7. **Open the PR** — rebase on the base branch first, then push and open it as a **draft**
   linking the issue:

   ```bash
   gh pr create --repo emmertio/nuxtinator --draft --base develop \
     --title "<title>" --body "Closes #<n>

   <what changed, and how each acceptance criterion is met>"
   ```

   Draft is the honest starting state: it hasn't passed review yet. The `reviewer` is what
   marks it ready.

8. **Gate it through the `reviewer` agent**, fixing and re-reviewing until it passes. See
   the `developer` agent for the loop and its three-round stop condition.

9. **Wait for CI** — `gh pr checks <n> --watch`. Green means Lint & types, Tests, and E2E
   all pass.

10. **Hand off** — remove `agent:working` once the PR is ready for review and green. Tear
    the worktree down after the PR merges, per the `worktree` skill.
