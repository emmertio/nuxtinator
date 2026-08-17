# GitHub comments posted by agents

Every comment, review, or review body an agent posts to GitHub — issue comment, PR
comment, inline review comment, formal review summary — **ends with this footer**:

```

<!-- agent:<name> -->
*Comment made by <Model Name>. AI can make mistakes.*
```

Example, from the `reviewer` agent running on Claude Opus 5:

```

<!-- agent:reviewer -->
*Comment made by Claude Opus 5. AI can make mistakes.*
```

Two lines, two audiences, both required:

- **`<!-- agent:<name> -->` is machine-readable and invisible to readers.** Our agents post
  through the repo owner's own GitHub account, so **author login cannot distinguish an
  agent's comment from a human's.** This marker is the only thing that can. `auto-support`
  skips any comment containing `<!-- agent:` — without it, the reviewer's findings read as
  fresh human feedback and get delegated to a second developer, who then commits to a
  branch another developer already owns.
- **The disclaimer is human-readable and never omitted.** Anyone reading the thread should
  know a model wrote it and may be wrong. Use the real model name you are running as, and
  don't reword it per comment — it's boilerplate on purpose.

`<name>` is the agent or skill that wrote it: `reviewer`, `developer`, `auto-support`.

**Editing a comment keeps the footer.** The reviewer edits its summary comment on every
re-review; the footer goes back on each time. A comment that loses its marker becomes
indistinguishable from human input and will be re-delegated.
