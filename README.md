# loopany

A long-running agent brain. Records what the agent did, tracks how it
played out, and iterates its own skills from what worked.

Markdown + frontmatter for storage. Append-only JSONL for the graph.
No database. Any MCP-capable agent (Claude Code, Hermes, OpenClaw,
Codex, custom) can attach this CLI and gain a persistent, self-iterating
brain.

## Install

Paste this into any MCP-capable agent (Claude Code, Hermes, Codex, …):

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
- [`skills/RESOLVER.md`](./skills/RESOLVER.md) — skill dispatcher (read this if you're an agent)
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

## Status

`0.1.0` — usable for single-user dogfooding. Self-iteration loop
(`improve` + `proposal-review` skills) is shipped; bundled domain packs
(CRM / ads / content / metrics) are designed but not yet ported.

## Acknowledgments

loopany stands on the shoulders of a few specific people's thinking:

- **[GBrain](https://github.com/garrytan/gbrain)** by Garry Tan — the
  architectural sibling. Same overall shape (CLI + skills + markdown +
  MCP), different focus: GBrain answers *"what do I know"*, loopany
  answers *"what did I do, did it work, what should I change next."*
- **[LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)**
  by Andrej Karpathy — mental model for markdown-as-agent-memory and the
  latent-vs-deterministic division of labor.
