---
name: review
description: Review work against our coding standards and the original request/issue criteria. Use when asked to "review this", "check my work", "does this meet the criteria" — before opening or merging a PR. Argument: optional target (diff, branch, PR number, path).
---

# review

Two-axis review of a change:

1. **Standards** — does it follow [coding-standards](../../rules/coding-standards.md)?
2. **Criteria** — does it actually do what the issue / original request asked, all of it?

## Steps

1. Get the diff (default: uncommitted + branch vs `master`).
2. Get the source of truth for intent (issue body, the user's request) and list its criteria.
3. Check the diff against each criterion → met / partial / missed.
4. Check the diff against the standards rules.
5. Report: criteria table, then findings ranked worst-first. Don't fix unless asked.

<!-- TODO: fill in — severity bar, what to ignore, whether to auto-fix, layer-boundary checks -->
