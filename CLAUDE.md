# CLAUDE.md

> A pattern for building self-iterating agents using LLMs. Project name: `loopany`.

Long-running brain for any agent harness (Claude Code, custom, MCP). Records
every action, tracks outcomes, accumulates references — so the agent reasons
over its own history. Markdown + append-only JSONL; no database.

GBrain answers "what do I know." This answers **"what did I do, did it
work, what should I change next."** Unit of memory = artifact
(action-and-outcome), not entity. Relations are causal (`caused-by`,
`led-to`, `follows-up`).

Commercial target first (CRM, Ads, Content, SaaS metrics); substrate is
goal-agnostic — personal-goals or research scopes work the same way.

## Core Concepts (three, final)

1. **Artifact** — markdown file with frontmatter. `kind` is an open registry.
   Everything the agent produces is an artifact: `signal`, `briefing`, `task`,
   `contact`, `deal`, and any kind a user or agent registers later.
2. **References** — append-only graph edges in `references.jsonl`. Hard links
   captured by the runtime at tool boundaries; soft links declared by the
   agent in frontmatter `mentions[]` or wiki links in content.
3. **Domain** — a meaningful scope the agent extracts from observed user
   activity (sales pipeline, paid ads, research thread, …). Holds
   scope-specific config and kinds so specialization doesn't pollute the
   global pool. Agent proposes, user accepts.

There is no separate Task entity — `task` is a kind. There is no separate
Action / Lesson concept — self-improvement emerges from `## Outcome` sections
+ a reflect loop writing `skill-proposals/`.

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
- `src/core/domain-loader.ts` — loads `loopany/config.yaml`, materializes enabled domains
- `src/core/skill-proposal.ts` — write / list / accept / reject proposals
- `src/mcp/server.ts` — stdio MCP server, all operations exposed as tools
- `src/commands/*.ts` — one file per CLI subcommand
- `domains/*/` — domains live under the **workspace** (`~/loopany/domains/{name}/`), not the source tree; each is extracted from real usage
- `skills/*.md` — core skills (resolver, conventions, core actions, reflect loop)

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

# Experimental 
loopany factory [--port N] [--no-open]         # read-only pixel-factory visualization of the workspace
```

## Kind System (agent-native, not TypeScript)

Kinds are defined in `loopany/kinds/*.md` — **not** TypeScript. Each file
carries frontmatter schema, status machine, UI hints, description. Runtime
parses on boot and builds zod validators + state machines dynamically.

Example: `kinds/task.md`

```markdown
---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
indexedFields: [status, priority, check_at, domain]
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

Agents propose new kinds via `loopany kind propose <file>`. Proposals land in
`kind-proposals/pending/` and require human accept.

**Most "I need to track X" should be a `note`, a new domain, or both — not a
new kind.** Kinds are for things that justify *runtime-enforced structure*
(see test below). Domains are for new organizational scopes. When in doubt,
write a `note`.

### Core kinds vs domain kinds

Core kinds ship with loopany. They represent primitives of any agent's life
cycle — not slots for specific use cases:

| Slot | Kind | The question it answers |
|---|---|---|
| intent | `goal` | What is this all for? |
| input | `signal` | What came in? |
| output | `brief` | What did I say back to the user? |
| work | `task` | What am I doing, and did it work? |
| belief | `learning` | What have I come to think, based on what? |
| change | `skill-proposal` | How do I want to update myself? |
| entity | `person` | Who is involved? |
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
`campaign`) fail (1) or (3) — they belong in a domain, not core.

## Domains

**Not pre-shipped.** A domain is a meaningfully separable scope the agent
notices in real usage — a sales pipeline, a paid-ads operation, a research
thread. Once the separation is real (kinds or workflows that don't make
sense outside this scope), the agent proposes the domain; the user accepts.

What a domain owns, scoped to itself:

```
~/loopany/domains/{name}/
  manifest.yaml                  # name, scope description, outcome windows
  kinds/*.md                     # kinds that only make sense here (e.g. contact, deal)
  settings.yaml                  # domain-specific config
  view.json                      # default UI view (optional)
```

Why scope-local configs and kinds: a `contact` kind makes sense in a CRM
domain, not in a research domain. Putting it globally pollutes the
artifact namespace and forces every other scope to reason about
fields it doesn't care about. Domains keep that mess local.

When the agent should *not* propose a domain: see
[[./skills/conventions/new-concept.md]] — most "I want to track X"
should be a `note` first, not a new domain.

## Self-Evolution Loop

Emerges from existing primitives. `learning` and `skill-proposal` are
**artifacts** (kinds), not special files:

1. Every completed `task` writes a `## Outcome` section (mandatory on
   `status: done`).
2. The `reflect` skill (cadence or on-demand) reads recent outcomes,
   dismissed signals, and thumbs-down events via `artifact list` + `get`.
3. It writes two artifact kinds with evidence:
   - `learning` — the belief ("deals with >3 stakeholders close 2.5x slower")
   - `skill-proposal` — the matching behavior change, citing the learning
4. User accepts or rejects via `loopany lesson accept|reject <id>`. On
   accept: diff applied to target skill file, git commit, `## Outcome`
   appended to the spr. On reject: `## Outcome` records the reason —
   future reflects won't re-suggest it.
5. `check_at` on accepted proposals schedules "did this help?" review;
   on active learnings, "is this still true?" review.

**The agent never edits skills directly.** Skill-proposal artifacts are
the only path. Learnings and skill-proposals are separate so one belief
can drive zero or many behavior changes, and a belief can be revised
(via `supersedes`) without churning derived skills.

## Architectural Constraints (must follow)

1. **All artifact operations are `artifact_*`.** Never `signal_create`,
   `task_create`, etc. Kind is always a parameter.
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
8. **Skill-to-skill links are `[[other-skill]]` in body**, not edges in
   `references.jsonl`. The reference graph is artifact-only; readers (human
   or agent) follow `[[…]]` manually.

## Build

```bash
# Bun or Node 22+, TypeScript, ESM
bun install && bun run build
bun run test
bun run test:e2e                 # requires a scratch workspace
```

Single static binary planned via `bun build --compile --outfile bin/loopany src/cli.ts`.

## Testing

Two tiers:
- **Unit** — parsing, validation, kind registry, store ops (no FS mocking)
- **E2E** — run the CLI against a real temp workspace, full artifact
  lifecycles + cross-domain flows

No database. Files + append-only JSONL.

## Code Conventions

- TypeScript strict mode, ESM only
- zod for runtime validation (including dynamic schemas from `kinds/*.md`)
- Prettier: single quotes, semicolons, 2-space indent
- Conventional commits
- No closed enums for domain concepts; use registries

## Markdown style (applies to every `.md` in this repo)

Every `.md` here must be **scannable at a glance** — humans and agents both
read to decide. Long prose buries the decision.

- **Lead with the point.** First sentence = what this file is, when to read
  it. No throat-clearing.
- **Short sections, short paragraphs.** 2–4 sentences. Break into a new
  heading before letting one sprawl.
- **Bullets / tables over prose** when content is enumerable.
- **Cut every sentence that doesn't change the reader's behavior.**
- **Don't restate the heading** in the first sentence.
- **One canonical place per fact.** Link, don't duplicate — drift is worse
  than a hop.
- **Examples over abstractions.** A 3-line concrete example beats a
  paragraph of definition.

When editing an existing `.md`, default to **shortening**, not adding. ≤1
line of new rule = 1 line written. Section past ~60 lines → look for cuts
before restructure.

## Design Philosophy

**Thin harness, fat skills** (Garry Tan's formulation):
- Harness (this CLI + core) is ~2000 lines: file I/O, validation, graph indexing
- Skills (markdown) carry judgment, prompts, process knowledge
- A skill is a method call — parameters in, different outcomes out

**Latent vs deterministic**:
- Judgment, synthesis, pattern matching → LLM (latent)
- SQL-like queries, validation, atomic writes → code (deterministic)
- Forcing one into the other is the most common architecture mistake

**Immutable for cited, mutable for "current understanding"**:
- Agent-produced artifacts (task, signal, briefing, learning,
  skill-proposal, entity kinds) — never edit in place. Append, flip
  status, or supersede.
- Config (settings.yaml, kind defs, skill files) — mutable + git. Skill
  files change only when a `skill-proposal` is accepted; the spr records
  rationale + evidence, git log records the literal diff.

## References

- **GBrain** — architectural sibling: `github.com/garrytan/gbrain`. Same
  shape (CLI + skills + markdown + MCP), different focus.
- **LLM Wiki** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## What to do when uncertain

1. Check `kinds/` for an existing kind before proposing a new one.
2. Before proposing any new kind, run the 4-question test ("should this
   be a kind at all"). If none hold, write a `note`.
3. New scope (→ domain) vs new entity type (→ kind)? Favor domain.
4. Behavior change affecting existing artifacts → write a migration at
   `skills/migrations/vX.Y.Z.md`, not a silent breaking change.
5. UI concept name ≠ internal kind name (e.g. user-facing "Task" but
   `kind: task` internally) → keep translation in the UI layer. Don't
   invent a new internal concept.
