# Changelog

## 0.1.0 — 2026-04-22

Initial public release.

### Core runtime

- 7 core kinds shipped: `signal`, `task`, `person`, `goal`, `brief`,
  `learning`, `skill-proposal`. Each is a markdown file in
  `kinds/*.md` with frontmatter schema, status machine, required
  sections, and declared `indexedFields`.
- Kind registry parses `kinds/*.md` at boot and builds Zod validators
  + state machines dynamically. No closed TypeScript enums for domain
  concepts.
- Artifact store (read / write / append / status / setField / list)
  over a flat `artifacts/` tree. Two storage strategies per kind:
  `date-bucketed` (`{YYYY-MM}/`) and `flat` (`{dirName}/`).
- `config.yaml` + domain loader: `enabled_domains` picks up
  per-domain kinds from `domains/<name>/kinds/*.md`.

### Index & graph

- In-memory index built once per CLI invocation, O(n) on artifact
  count. Exposes lookups by `id`, `kind`, `status`, `domain`, and
  per-kind indexed `field` (Map-backed, O(1) per query).
- Reference graph: explicit edges in `references.jsonl` (append-only).
- Implicit edges promoted at index time from frontmatter `mentions:`
  and body `[[id]]` wiki links. On-disk is never touched — edit the
  artifact, edges reconcile on next build.

### Commands

```
init
kind list
artifact create | get | list | append | status | set
refs add | refs <id> [--direction in|out|both] [--relation R] [--depth N]
followups
domain list | enable | disable
doctor
```

- `artifact list` supports any `--<field> <value>` filter — indexed
  fields route through the per-kind field index, others fall back to
  linear scan.
- `artifact list --contains <query>`: case-insensitive substring
  search across body and string-valued frontmatter fields (catches
  both `## body content` and `summary:` / `title:` etc.).
- `artifact set` updates any non-status frontmatter field. Status is
  reserved for `artifact status` (enforces the state machine).
- `doctor`: 7 deterministic integrity checks (workspace, kinds,
  artifacts, references, onboarding, goal coverage, domain coverage).
  No semantic checks — those belong to `improve`.

### Audit

- `audit.jsonl` records every CLI invocation with args, result, and
  optional `--reason`. Reasons live here, not in artifact bodies.

### Skills

- `skills/RESOLVER.md` — dispatcher. Agents read it first, then
  follow its trigger → skill-file table.
- `skills/conventions/relations.md` — 6 canonical relation verbs
  (`led-to`, `addresses`, `mentions`, `supersedes`, `follows-up`,
  `cites`).
- `skills/signal-capture.md` — when to log a signal vs skip;
  source classification; dismissal with reason; upgrade path to
  `task` via `addresses`.
- `skills/task-lifecycle.md` — three task shapes (`[change]`,
  `[incident]`, bare); body section standards; status transition
  decision tree; `check_at` defaults; Outcome quality standards.
- `skills/improve.md` — periodic reflection on outcomes / dismissed
  signals / rejected proposals. Writes `learning` + `skill-proposal`
  artifacts with evidence.
- `skills/proposal-review.md` — accept / reject pending proposals.
  Accept applies the natural-language diff described in the proposal
  body to the target skill file, commits, records the actual change
  in the proposal's `## Outcome`. Reject records the reason so
  future `improve` runs don't re-suggest the same change.

### Agent docs

- `INSTALL_FOR_AGENTS.md` — 8-step install + skill-loading guide,
  with per-agent loader recipes (Claude Code, Hermes, OpenClaw,
  other).
- `ONBOARDING.md` — 5-phase first-run conversation. Produces
  `prs-self` (person artifact) + `gol-<slug>` (goal artifact);
  optional stakeholder persons + Phase-4 knowledge-source backfill.

### Tests

147 tests across 10 files (unit + e2e). End-to-end exercises full
artifact lifecycles, domain packs, the proposal-accept flow, and
the reference graph.

### Design

Philosophy documented in `CLAUDE.md`:
- Thin harness, fat skills
- Latent (LLM judgment) vs deterministic (code) separation
- Immutable for cited artifacts, mutable + git for skills/config
- Agent proposes, human accepts (for kinds, skills, migrations)
