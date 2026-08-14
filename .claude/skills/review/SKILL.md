---
name: review
description: Review work against our coding standards and the original request/issue criteria. Use when asked to "review this", "check my work", "does this meet the criteria" — before opening or merging a PR. Argument: optional target (diff, branch, PR number, path).
---

# review

Two-axis review of a change:

1. **Standards** — does it follow [coding-standards](../../rules/coding-standards.md)?
2. **Criteria** — does it do what the issue or original request asked, *all* of it?

This is the method. The `reviewer` agent adds the enforcement policy (severity, PR
gating, the checklist comment); a human running `/review` just wants the findings.

**Evidence over assertion.** "Auth is handled" is not a pass. "Enforced at
`server/utils/auth.ts:31`, covered by `tests/auth/login.test.ts:88`" is. Every claim
resolves to a file, a line, a test, or a deliberate "N/A".

## Gather

1. **Read the rubric fresh** — [coding-standards](../../rules/coding-standards.md) and
   [CLAUDE.md](../../../CLAUDE.md). They change. Never review from memory of them.
2. **Get the intent**: the linked issue body (`gh issue view <n>`), or the request itself.
   List its acceptance criteria explicitly before looking at code — deriving criteria
   *from* the diff is how a review concludes that whatever was built is what was wanted.
3. **Get the diff**: uncommitted + branch vs `master`, or `gh pr diff <n>`. Include
   untracked files — new files are where violations concentrate.
4. **Read changed files in full**, not just hunks. A diff hunk hides whether a component
   fetches data three lines above the change.

## Verify

Run the checks; report real output. Never claim a check passed unless you saw it pass.

```
bun run lint · bun run typecheck · bun run verify-layers · bun run test · bun run test:e2e
```

**Know what each one actually proves.** `bun run lint` reads only `dev/` — 7 files — so
changed layer code is unlinted and a green result says nothing about it. A vitest run
reporting `0/0 passed` is a broken suite, not an empty one. Prerequisites and traps are
in the standards' enforcement table.

## Check

**Criteria** — each one: met / partial / missed, with the evidence. A partial is a miss.

**Standards**, in rough order of how often they're violated here:

- **§0 floor** — server-side authz on every route; tenant isolation enforced by the query
  (RLS + GUC), not a filter above it; `adminDb` only inside the tenancy layer; no
  swallowed errors.
- **§5 database** — every migration has a real `down`; a new tenant-scoped table has its
  `_T<NNN>_` retrofit *in this PR*; schema `.d.ts` updated alongside.
- **§2 reuse** — does this component/composable/util already exist in another layer? A
  near-duplicate is a finding.
- **§4 testing** — error paths, not just happy path; behavior asserted, not execution;
  nothing skipped or `.only`; cross-org negative test where tenancy is touched; a
  regression test proven to fail without its fix.
- **§1 TypeScript** — `any`, `@ts-ignore`, or any loosening of config to silence an error
  (that last one is serious, not cosmetic).
- **§7 provenance** — grep, don't eyeball:
  ```bash
  git diff | grep -nE "^\+.*([A-Z]{2,10}-[0-9]+|20[0-9]{2}-[0-9]{2}|@(author|since))"
  ```
- **§8 theming** — colour literals and font families in components:
  ```bash
  git diff | grep -nE "^\+.*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|font-\[)"
  ```
- **§9 responsive** — base utilities are mobile; no `max-*` variants; no breakpoint class
  built by interpolation (that one is a bug — Tailwind can't see it, so it isn't emitted).

Then look **beyond** the criteria. Implementation reveals holes the plan couldn't.

## Report

Findings worst-first. Each one: `file:line`, the rule or criterion it breaks, and the
concrete fix — plus a repro or failing case for anything behavioural.

Separate **must fix** (standards violation, bug, failing check, missed criterion) from
**worth considering** (judgment, structure, naming). Note anything out of scope under its
own heading rather than acting on it.

Don't pad. If the change is clean, say so in a sentence and list the checks you ran.
Inventing findings to look thorough is its own failure. **Don't fix anything** unless
you were asked to — reporting and fixing are separate jobs on purpose.
