# CLAUDE.md

 "A pattern for building self-iterating agents using LLMs."

> **Project codename**: `loopany` (placeholder — rename when decided)

Long-running agent brain. Records every action, tracks outcomes over time,
iterates its own skills from what worked. Like GBrain in architecture, but
focused on **what the agent did and how it played out**, not on what it knows.

Any agent harness (Claude Code, a custom harness, MCP-capable client) can
attach this CLI + skills bundle and gain a persistent, self-iterating brain.

## Project Overview

GBrain answers "what do I know." This answers **"what did I do, did it work,
what should I change next."** Unit of memory = artifact (action-and-outcome),
not entity. Relations are causal (`caused-by`, `led-to`, `follows-up`), not
merely semantic.

**Commercial target first** (CRM, Ads, Content, SaaS metrics), but the
substrate is goal-agnostic. A personal-goals pack (fitness, learning) or a
research pack would slot into the same architecture.

## Core Concepts (three, final)

1. **Artifact** — markdown file with frontmatter. `kind` is an open registry.
   Everything the agent produces is an artifact: `signal`, `briefing`, `task`,
   `contact`, `deal`, and any kind a user or agent registers later.
2. **References** — append-only graph edges in `references.jsonl`. Hard links
   captured by the runtime at tool boundaries; soft links declared by the
   agent in frontmatter `mentions[]` or wiki links in content.
3. **Domain** — organization layer + pluggable pack. Ships settings, view,
   learnings, kinds, skills, and cron defaults. User enables per-workspace.

**There is no separate Task entity.** `task` is a kind like any other.
**There is no separate Action / Lesson concept.** Self-improvement emerges
from tasks having `## Outcome` sections + a reflect loop writing
`skill-proposals/`.

## Storage Layout

```
~/loopany/                           # workspace root
  config.yaml                    # enabled domains, goal
  
  artifacts/
    {YYYY-MM}/                   # time-bound kinds (signal, briefing, task, outcome)
      sig-*.md
      brf-*.md
      tsk-*.md
    contacts/                    # entity kinds — no date bucket
    companies/
    deals/
  
  kinds/
    *.md                         # kind definitions (one file per kind)
  
  domains/
    {name}/
      settings.yaml
      view.json
      daily/{YYYY-MM-DD}.json    # raw data + artifact pointers
  
  references.jsonl               # graph events, append-only
  audit.jsonl                    # operational events, append-only
```

## Key Files (planned — to be implemented)

- `src/cli.ts` — entrypoint, mirrors CLI command table below
- `src/core/operations.ts` — contract-first op definitions (CLI and MCP both generated)
- `src/core/artifact-store.ts` — read/write/list/append for markdown artifacts
- `src/core/kind-registry.ts` — parses `loopany/kinds/*.md`, exposes validators + state machines
- `src/core/references.ts` — append-only graph, in-memory index build at startup
- `src/core/domain-loader.ts` — loads `loopany/config.yaml`, materializes enabled domain packs
- `src/core/skill-proposal.ts` — write / list / accept / reject proposals
- `src/mcp/server.ts` — stdio MCP server, all operations exposed as tools
- `src/commands/*.ts` — one file per CLI subcommand
- `domains/*/` — bundled domain packs (crm, ads, content, metrics, support, market)
- `skills/*.md` — core skills (resolver, conventions, core actions, improve loop)

## Commands

All planned — implement these in order as MVP.

```bash
# Init
loopany init                                   # scaffold workspace at $LOOPANY_HOME (default ~/loopany)

# Artifact operations (one namespace for all kinds)
loopany artifact create --kind X --content ... [--mentions ...] [--domain ...]
loopany artifact append <id> --section "..."
loopany artifact status <id> <new-status> [--reason "..."]
loopany artifact set <id> --<field> <value>    # edit a non-status frontmatter field
loopany artifact get <id>
loopany artifact list [--kind] [--domain] [--status] [--date] [--where]

# Graph queries
loopany refs <id> [--direction in|out|both] [--relation X] [--depth 1|2]
loopany search <query> [--kind] [--domain] [--since]

# Follow-up scheduling
loopany followups [--due today|overdue]        # list artifacts whose check_at is due

# System
loopany domain enable|disable|list
loopany kind propose <file.md>                 # validate + write to proposals
loopany kind list
loopany lesson accept|reject <id>              # resolve a proposal
loopany lint                                   # validate workspace integrity
loopany doctor                                 # health check

# Agent integration
loopany mcp                                    # stdio MCP server

# Experimental (not part of core MVP)
loopany factory [--port N] [--no-open]         # read-only pixel-factory visualization of the workspace
                                               # code: src/ui/ · PRD: docs/factory-ui-prd.md
```

## Kind System (agent-native, not TypeScript)

Kinds are defined in `loopany/kinds/*.md` — **not** TypeScript. Each file carries
frontmatter schema, status machine, UI hints, and description. Runtime parses
on boot and builds zod validators + state machines dynamically.

Example: `kinds/task.md`

```markdown
---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
indexedFields: [status, priority, scheduled_for, domain]
---

## Frontmatter
\`\`\`yaml
title:    { type: string, required: true }
status:   { type: enum, values: [todo, running, in_review, done, failed, cancelled] }
priority: { type: enum, values: [low, medium, high, critical] }
\`\`\`

## Status machine
\`\`\`yaml
initial: todo
transitions:
  todo: [running, done, cancelled]
  running: [in_review, done, failed, cancelled]
\`\`\`

## Required sections
on `status: done` → body must contain `## Outcome`

## UI
cardFields: [title, status, priority]
```

Agents can propose new kinds via `loopany kind propose <file>`. Proposals land in
`kind-proposals/pending/` and require human accept before becoming active.

**Most "I need to track X" should be a `note`, a new domain, or both — not a
new kind.** Kinds are for things that justify *runtime-enforced structure*
(see the test below). Domains are for new organizational scopes
(podcast-appearances, weekly-review). When in doubt, write a `note`.

### Core kinds vs domain kinds

Core kinds ship with loopany. They represent primitives of any agent's life
cycle — not slots for specific use cases:

| Slot | Kind | The question it answers |
|---|---|---|
| input | `signal` | What came in? |
| output | `brief` | What did I say back to the user? |
| work | `task` | What am I doing, and did it work? |
| entity | `person` | Who is involved? |
| intent | `goal` | What is this all for? |
| belief | `learning` | What have I come to think, based on what? |
| change | `skill-proposal` | How do I want to update myself? |
| fallback | `note` | I just want to write something down. |

**Test for "should this be a kind at all (vs. just a `note`)?"** — at
least one must hold. Otherwise it's a `note`:

1. **State machine** — moves through enforced states
2. **Identity / dedup** — many references resolve to one canonical entity
3. **Structured queries** — filtered or aggregated by typed fields
4. **Required body shape** — a downstream program depends on fixed sections

If you pass this test, then ask the next one.

**Test for "should this be a core kind?"** — all three must hold:

1. Would every agent, regardless of domain, want this slot?
2. Does it represent a distinct part of the lifecycle, without overlapping
   an existing core kind?
3. Is it about HOW the agent operates, not WHAT it operates on?

Verticals (`contact`, `deal`, `invoice`, `recipe`, `experiment`, `paper`,
`campaign`) fail (1) or (3) — they belong in a domain pack, not core.

## Domain Packs

Bundled in the `loopany` package, opt-in per workspace. Each pack contains:

```
domains/crm/
  manifest.yaml                  # name, version, outcome windows
  skills/*.md                    # how to act in this domain
  kinds/*.md                     # domain-specific kinds (contact, deal)
  cron/*.yaml                    # default scheduled jobs
  view.json                      # default UI spec
```

Ships: `crm`, `ads`, `content`, `metrics`, `support`, `market`. Users can
write custom packs in `loopany/custom-domains/`.

## Self-Evolution Loop

Emerges from existing primitives — no new concepts. Both `learning` and
`skill-proposal` are **artifacts** (kinds), not special files:

1. Every completed `task` writes a `## Outcome` section (mandatory on `status: done`)
2. The `improve` skill (`skills/improve.md`) — invoked on cadence or on user
   request — reads recent outcomes, dismissed signals, and thumbs-down events
   via `loopany artifact list` + `loopany artifact get`.
3. Finds patterns and writes two kinds of artifact, both citing evidence:
   - `learning` — the belief ("deals with >3 stakeholders close 2.5x slower")
   - `skill-proposal` — the matching behavior change, referencing the learning
4. User reviews via web UI or `loopany lesson accept <id>` / `reject <id>`
   (shortcut for `loopany artifact status <id> accepted|rejected` on a
   `skill-proposal`)
5. On `accepted`: the proposal's diff is applied to the target skill file,
   committed via git, and a `## Outcome` section is appended to the
   `skill-proposal` body recording what changed
6. On `rejected`: `## Outcome` records the reason. Future runs of the
   `improve` skill read rejections and won't re-suggest the same rule
7. `check_at` on accepted proposals schedules "did this change help?" review;
   `check_at` on active learnings schedules "is this still true?" review

**The agent never edits skills directly.** Skill-proposal artifacts are the
only path. Learnings and skill-proposals are separate on purpose: one belief
can drive zero or many behavior changes, and a belief can be revised
(via `supersedes`) without churning derived skills.

## Architectural Constraints (must follow)

1. **All artifact operations are `artifact_*`.** Never `signal_create`,
   `task_create`, `briefing_create`, etc. Kind is always a parameter.
2. **`kind` and `relation` are open registries**, not closed enums. New
   entries are config, not code changes.
3. **Kind definitions live in markdown files**, not TypeScript. Runtime is
   data-driven.
4. **Artifacts are never edit-in-place for cited kinds.** Append to body,
   flip status, or supersede. The file is the canonical record.
5. **Storage and Organization are separate.** `artifacts/` is the flat pool;
   `domains/` is curated views. One artifact can be referenced from multiple
   domains.
6. **Agent proposes, human accepts.** For skills, kinds, and migrations.
7. **Markdown + frontmatter is the format.** Structured pieces (metric,
   chart) go in fenced code blocks inside the body, not JSON envelopes.
8. **Skill-to-skill relations live as `[[other-skill]]` in skill body, not
   in `references.jsonl`** *(preliminary — the broader "skills as graph"
   framing is still maturing).* The runtime does not walk `skills/` for
   link extraction; the reference graph is artifact-only. If a skill needs
   to cite another skill, write `[[name]]` in the body and let the reader
   (human or agent) follow it manually — don't add a structured edge field.

## Build

```bash
# TBD — Bun or Node 22+, TypeScript, ESM
bun install
bun run build
bun run test
bun run test:e2e                 # requires a scratch workspace
```

Plan to use `bun build --compile --outfile bin/loopany src/cli.ts` for a single
static binary (same as GBrain's approach).

## Testing

Two tiers:
- **Unit** — parsing, validation, kind registry, store operations (no filesystem side effects mocked out)
- **E2E** — run the CLI against a real temp workspace, exercise full artifact lifecycles and cross-domain flows

No database needed. Everything is files + append-only JSONL.

## Code Conventions

- TypeScript strict mode, ESM only
- zod for runtime validation (including dynamic schemas parsed from `kinds/*.md`)
- Prettier: single quotes, semicolons, 2-space indent
- Conventional commits
- No closed enums for domain concepts; use registries

## Design Philosophy

**Thin harness, fat skills** (Garry Tan's formulation):
- Harness (this CLI + core) is ~2000 lines, does file I/O, validation, graph indexing
- Skills (markdown) carry the judgment, the prompts, the process knowledge
- A skill is a method call — takes parameters, produces different outcomes
  depending on arguments

**Latent vs deterministic**:
- Judgment, synthesis, pattern matching → LLM (latent)
- SQL-like queries, validation, atomic writes → code (deterministic)
- Forcing one into the other is the most common architecture mistake

**Immutable for cited, mutable for "current understanding"**:
- All agent-produced artifacts (task, signal, briefing, learning,
  skill-proposal, entity kinds) — never edit in place. Append to body,
  flip status, or supersede.
- Configuration (settings.yaml, kind defs, skill files) — mutable + git.
  Skill files are edited only when a `skill-proposal` is accepted; the
  spr artifact records the rationale and evidence, git log records the
  literal diff.

## References

- **GBrain** — architectural sibling: `github.com/garrytan/gbrain`.
  Same overall shape (CLI + skills + markdown + MCP), different focus.
- **Thin harness, fat skills** essay by Garry Tan (YC SS 2026 talk).
- **LLM Wiki** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## MVP Scope

**Task 0** — core loop without domains:
- [ ] `loopany init`, `loopany artifact create|append|status|get|list`
- [ ] `kinds/signal.md`, `kinds/task.md`, `kinds/note.md` ship defaults
- [ ] `loopany followups` (reads `check_at` frontmatter, lists today's)
- [ ] Unit tests for artifact store + kind registry

**Task 1** — domain system + first pack:
- [ ] `loopany domain enable|disable|list`
- [ ] CRM pack as reference (skills + `kinds/contact.md` + `kinds/deal.md`)
- [ ] `loopany refs`, `loopany search`

**Task 2** — self-improvement loop:
- [ ] `kinds/learning.md`, `kinds/skill-proposal.md` ship as core kinds
- [ ] `skills/improve.md` drives reflection using `loopany artifact list`
      + `loopany artifact get` — writes `learning` + `skill-proposal`
      artifacts with evidence. No dedicated CLI; the skill is the impl.
- [ ] `loopany lesson accept|reject` (shortcut for
      `artifact status <spr-id> accepted|rejected`; on accept, applies diff
      to target skill file + git commit + appends `## Outcome` to the spr)
- [ ] MCP server (`loopany mcp`) exposing full command set
- [ ] First end-to-end: enable CRM → agent records outreach tasks → the
      `improve` skill writes a `learning` + a `skill-proposal` → user
      accepts → CRM skill file changes

## Naming (TBD)

Current placeholder: `loopany`.

## What to do when uncertain

1. Check `kinds/` for an existing kind definition before proposing a new one.
2. Before proposing any new kind, ask: **could this just be a `note`?** Run
   the 4-question test ("should this be a kind at all"). If none of the
   four conditions hold, write a `note` instead.
3. Check if the thing-to-track is a new organizational scope (→ domain) vs a
   fundamentally new entity type (→ kind). Favor domain.
4. For any behavior change that affects existing artifacts, write a migration
   file at `skills/migrations/vX.Y.Z.md` rather than a silent breaking change.
5. If the user-facing UX needs a concept name different from the internal
   kind (e.g. "Task" for users, `kind: task` internally) — keep the UI layer
   doing the translation. Don't invent a new internal concept.
