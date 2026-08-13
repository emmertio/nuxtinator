---
name: auto-support
description: Watch GitHub issues and PRs on this repo and hand each one to a developer agent automatically. Use when asked to "turn on auto support", "watch the repo", "auto-triage incoming issues/PRs". Runs continuously.
---

# auto-support

Subscribe to repo activity and delegate it to `developer` agents asynchronously. You are
the dispatcher — you never write code yourself.

## Loop

1. **Poll issues** — new / newly-labeled open issues (`gh issue list`).
   For each unclaimed one: spawn a background `developer` agent with the issue number.
   Track issue → agent → resulting PR.
2. **Poll the PRs** those agents opened.
   Route each new event to the same (or a fresh) `developer` agent:
   - review comments / requested changes → fix
   - plain comments asking for something → do it
   - failing checks or merge conflicts → resolve
3. Repeat. Never queue the same issue or comment twice — track what's handled.

Pair with `/loop` for the polling cadence.

<!-- TODO: fill in — which repo, label/assignee filter for opt-in, dedupe state file, max concurrent devs, what to escalate to a human instead of delegating -->
