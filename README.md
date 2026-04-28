# loopany

**An agent skill for long-horizon work and self-improvement.**

Most agents forget. They finish a task, the context window resets, and
the next session starts blind — same mistakes, same blind spots, no
memory of what worked. loopany is the persistent layer that fixes this:

- **Long-cycle tasks** — the agent records what it did, what came back,
  and what's still open, so work that spans days or weeks survives
  across sessions.
- **Self-learning** — every completed task writes an outcome. A reflect
  loop reads those outcomes, distills beliefs (`learning`) and proposes
  changes to its own skills (`skill-proposal`). The user accepts or
  rejects; accepted changes are diffed into the skill files and
  committed.

The substrate is intentionally boring: markdown + frontmatter as the
source of truth, append-only JSONL for the reference graph, no
database. Any agent harness (Claude Code, Hermes, OpenClaw, Codex,
custom) can attach this CLI and inherit a persistent, self-iterating
brain. An optional local SQLite index is built on demand for search;
it's a derived artifact and can be deleted at any time without data
loss.

## Install

Paste this into any agent harness (Claude Code, Hermes, Codex, …):

```
Retrieve and follow the instructions at:
https://raw.githubusercontent.com/superdesigndev/loopany/main/INSTALL_FOR_AGENTS.md
```

The agent clones the repo, installs Bun + the CLI, initializes your
workspace, runs a 5-phase onboarding conversation with you, and loads
the skill library. You don't run any shell commands yourself.

## Learn more

- [`CLAUDE.md`](./CLAUDE.md) — design philosophy, core concepts, MVP scope
- [`INSTALL_FOR_AGENTS.md`](./INSTALL_FOR_AGENTS.md) — agent-facing install + command reference
- [`ONBOARDING.md`](./ONBOARDING.md) — the 5-phase first-run script
- [`skills/loopany-resolver/SKILL.md`](./skills/loopany-resolver/SKILL.md) — skill dispatcher (read this if you're an agent)
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

## Testing

```bash
# Unit + e2e tests (loopany CLI logic)
bun test

# Skill regression — installs all 5 skills into Claude Code,
# runs 10 scenarios via `claude -p`, and verifies workspace artifacts.
# Requires: claude CLI in PATH + active API key.
./test/skill-regression.sh            # run all 10 scenarios
./test/skill-regression.sh 4          # run only scenario 4
./test/skill-regression.sh --dry-run  # show commands without calling claude
```

The skill regression covers: artifact creation (signal/task/note), capture
quality gate, daily/weekly review, reflect threshold, signal→task upgrade,
and kind routing. Each scenario spawns a fresh workspace, so runs are
isolated. Expect ~5 min for a full pass (10 `claude -p` calls).

## Status

`0.1.0` — usable for single-user dogfooding. Self-iteration loop
(`reflect` skill writes proposals; the user applies accepted ones) is
shipped; bundled domain packs (CRM / ads / content / metrics) are
designed but not yet ported.

## Acknowledgments

loopany stands on the shoulders of a few specific people's thinking:

- **[GBrain](https://github.com/garrytan/gbrain)** by Garry Tan — the
  architectural sibling. Same overall shape (CLI + skills + markdown),
  different focus: GBrain answers *"what do I know"*, loopany answers
  *"what did I do, did it work, what should I change next."*
- **[LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)**
  by Andrej Karpathy — mental model for markdown-as-agent-memory and the
  latent-vs-deterministic division of labor.
