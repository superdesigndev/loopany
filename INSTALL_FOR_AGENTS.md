---
name: loopany-install-for-agents
description: One-shot install + usage reference. Read once at agent setup to clone the repo, install Bun + CLI, initialize the workspace, and load the skill library.
---

# loopany — install & usage for AI agents

Read this file once. It tells you what loopany is, how to install it, and how
to use every command. After this, you can use loopany without re-reading.

## What it is

A long-running brain for an agent. Records every action you take, tracks
outcomes, and accumulates references so you can reason over your own history.
Backed by markdown + append-only JSONL. No database.

The unit of memory is an **artifact** — a markdown file with YAML frontmatter.
Every kind (task / signal / person / future kinds) is an artifact. References
between artifacts form a graph (`led-to`, `mentions`, `caused-by`, ...).

## Step 1 — Install

```bash
git clone https://github.com/superdesigndev/loopany.git ~/loopany-src && cd ~/loopany-src
curl -fsSL https://bun.sh/install | bash       # if Bun not yet installed
export PATH="$HOME/.bun/bin:$PATH"              # add to ~/.zshrc too
bun install && bun link
loopany --version                                # verify
```

> If `loopany` is not found, your shell does not have `~/.bun/bin` in PATH.
> Add `export PATH="$HOME/.bun/bin:$PATH"` to `~/.zshrc` and `source ~/.zshrc`.

## Step 2 — Initialize the workspace

```bash
loopany init                                     # creates ~/loopany/
```

- Default workspace location: `~/loopany/`
- Override with env var: `LOOPANY_HOME=/path/to/brain loopany init`
- Idempotent — safe to run twice; missing pieces get re-created
- Bundled kinds (task / signal / person) are copied into `~/loopany/kinds/`

After init, `~/loopany/` looks like:

```
~/loopany/
├── config.yaml
├── kinds/
│   ├── task.md            # status machine + frontmatter schema
│   ├── signal.md
│   ├── person.md
│   ├── goal.md
│   └── brief.md
├── artifacts/
│   ├── {YYYY-MM}/         # date-bucketed kinds (task, signal, brief)
│   ├── people/            # flat-storage (person)
│   └── goals/             # flat-storage (goal)
└── references.jsonl       # append-only graph edges
```

## Step 3 — Onboard the user (DO NOT SKIP)

Read `ONBOARDING.md` and run the conversation. A loopany brain without
an active `goal` is a filing cabinet, not a brain. `loopany init` itself
reminds you with a "NEXT — read ONBOARDING.md" line; honor it.

If any `goal` artifact already exists in `~/loopany/artifacts/goals/`,
onboarding has been run — skip to Step 5.

## Step 4 — Load the skill resolver

loopany ships a **skill library** at `~/loopany-src/skills/`. Skills are
markdown — judgment and process knowledge, not code. The runtime knows
nothing about them; **you (the agent) read them on demand**.

The entry point is `skills/RESOLVER.md`. It maps triggers (user phrases
or agent decisions) to the skill file you must read before acting.

Step 4 implants **two things** into the agent's persistent context, in
the same injection: (a) where the resolver lives, and (b) when to
proactively invoke capture. The content is identical across hosts; only
the write mechanism differs.

### §A Coding CLIs (Claude Code, Codex)

#### Claude Code — user-level install (default)

loopany's workspace is user-global (`~/loopany`), so the resolver
should be too. Write once to `~/.claude/CLAUDE.md` and every Claude
Code session on this machine picks it up — no per-project setup.

```bash
grep -q "loopany skill resolver" ~/.claude/CLAUDE.md 2>/dev/null || \
cat >> ~/.claude/CLAUDE.md <<'BLOCK'

## loopany skill resolver

loopany is installed at `~/loopany-src/`. The skill dispatcher is at
`~/loopany-src/skills/RESOLVER.md`.

- Before any `loopany artifact *` / `loopany refs *` call, read the
  resolver and follow its trigger → skill mapping.
- Conventions in `~/loopany-src/skills/conventions/` apply on top of
  every skill.

## loopany auto-record trigger

After any substantive work concludes in this session — PR shipped,
incident resolved, decision made, signal noticed, outcome observed —
dispatch a subagent to record it as a loopany artifact. The subagent
reads the resolver to pick the right skill, then runs
`loopany artifact create --kind <X>` with appropriate frontmatter and
body. Main session stays focused; capture still happens.
BLOCK
```

The `grep -q ... ||` guard makes this **idempotent** — safe to re-run
after `git pull` or on a new machine; it appends once and skips
thereafter.

**Opt-in per project instead** (if you don't want loopany active in
every Claude Code session): append the same block to that project's
own `./CLAUDE.md`, or to
`~/.claude/projects/<slug>/memory/MEMORY.md` where `<slug>` is the
project's absolute path with `/` replaced by `-`
(e.g. `/Users/x/dev/y` → `-Users-x-dev-y`). User-level is the default.

#### Codex — AGENTS.md

Codex's convention is `AGENTS.md`. If your Codex setup honors
`~/AGENTS.md` user-wide, prefer that (symmetric with the Claude Code
default). Otherwise append to the project-root `./AGENTS.md` for each
project where loopany should be active.

```bash
# User-wide (if supported by your Codex setup)
TARGET="$HOME/AGENTS.md"
# Or project-scoped:
# TARGET="./AGENTS.md"

grep -q "loopany skill resolver" "$TARGET" 2>/dev/null || \
cat >> "$TARGET" <<'BLOCK'

## loopany skill resolver

loopany is installed at `~/loopany-src/`. The skill dispatcher is at
`~/loopany-src/skills/RESOLVER.md`.

- Before any `loopany artifact *` / `loopany refs *` call, read the
  resolver and follow its trigger → skill mapping.
- Conventions in `~/loopany-src/skills/conventions/` apply on top of
  every skill.

## loopany auto-record trigger

After any substantive work concludes in this session — PR shipped,
incident resolved, decision made, signal noticed, outcome observed —
dispatch a subagent to record it as a loopany artifact. The subagent
reads the resolver to pick the right skill, then runs
`loopany artifact create --kind <X>`. Main session stays focused.
BLOCK
```

### §B Agent platforms (Hermes, OpenClaw)

#### Hermes — add to platform memory

Hermes has multi-platform messaging and built-in cron; skill discovery
is via its memory layer. Register one line that covers both sides:

```
/memory add "loopany: dispatcher at ~/loopany-src/skills/RESOLVER.md — read before any loopany artifact op. Conventions in skills/conventions/ apply on top. After substantive work concludes (PR / incident / decision / signal / outcome), delegate a subagent to record via loopany."
```

#### OpenClaw — platform memory for now (plugin.json deferred)

The right long-term shape is a plugin manifest:

```json
{
  "name": "loopany",
  "mcpServers": { "loopany": { "command": "loopany", "args": ["mcp"] } },
  "skills": ["~/loopany-src/skills/RESOLVER.md", "~/loopany-src/skills/conventions/"]
}
```

But **loopany does not ship an MCP server yet** — `loopany mcp` is in
CLAUDE.md's MVP scope, not built. Until it exists, register the
resolver via OpenClaw's memory primitive the same way Hermes does (the
one-liner above). When `loopany mcp` lands, this section will switch to
the plugin.json path.

### Verify

Concrete file checks, not self-query:

```bash
# Did the injection land?
grep -l "loopany skill resolver" ~/.claude/CLAUDE.md ~/AGENTS.md 2>/dev/null

# Is loopany itself still at the expected path?
test -f ~/loopany-src/skills/RESOLVER.md && echo "RESOLVER present"
```

Then start a fresh session and ask the agent: **"where is the loopany
resolver?"** If it answers `~/loopany-src/skills/RESOLVER.md` without
opening any file, context was loaded. If it has to search, the memory
file exists but didn't inject — check the host's memory-scope rules.

### Audit / re-install

- The `grep -q ... ||` guard makes install **idempotent** — re-running
  is a no-op if already present; it appends exactly once.
- To audit a machine later: re-run the `grep -l` check above.
- Updating loopany (`git pull ~/loopany-src`) **doesn't require re-
  running Step 4** — the injected block only points at the resolver,
  which is in the repo. Skill content can change; the pointer doesn't.
- Forthcoming `loopany doctor` check for resolver-registration is on
  the roadmap but not built yet.

### What's in the skill library today

| Path | Purpose |
|---|---|
| `skills/RESOLVER.md` | Dispatcher — read this first |
| `skills/conventions/relations.md` | Relation verbs for `refs add` |
| `skills/signal-capture.md` | When to log a signal, how to write it |
| `skills/task-lifecycle.md` | Task shapes, body sections, status transitions, Outcome standards |
| `skills/improve.md` | Reflection loop — write learnings and skill-proposals |
| `skills/proposal-review.md` | Accept / reject skill-proposals |
| `skills/capture-on-complete.md` | When + how to proactively record work after it concludes (triggers, quality bar, subagent pattern) |

You do **not** need to memorize these. You need to remember to read
RESOLVER first.

The full trigger discipline — which kind to write for each of the 5
classes, the quality bar, and the subagent dispatch pattern — lives in
`skills/capture-on-complete.md`. The 5-trigger list in the injected
block is the always-in-context summary; the skill file is what the
subagent reads to actually produce the artifact.

## Step 5 — Commands

All commands print **JSON to stdout** unless noted. Errors go to stderr,
exit code is non-zero. `loopany` works from any cwd — the workspace is
always `$LOOPANY_HOME` (default `~/loopany`).

### System

```bash
loopany kind list                                # lists registered kinds (JSON)
loopany doctor                                    # workspace health check
loopany doctor --format json                      # machine-readable

loopany domain list                               # show enabled + observed domains
loopany domain enable <name>                      # persist to config.yaml
loopany domain disable <name>                     # remove from config
```

### Create artifacts

```bash
# Task (timestamp ID, date-bucketed)
loopany artifact create --kind task \
  --title "Follow up with Alice" \
  --status todo \
  --priority high \
  --check-at 2026-04-29 \
  --mentions prs-alice-chen,prs-bob-li \
  --content "ping her about the contract"

# Person (slug ID, flat-stored — --slug REQUIRED)
loopany artifact create --kind person \
  --slug alice-chen \
  --name "Alice Chen" \
  --aliases alice,a.chen \
  --emails alice@example.com

# Signal (timestamp ID, lightweight — no status machine)
loopany artifact create --kind signal \
  --summary "User wants Alice followup" \
  --source chat
```

Returns: `{"id": "...", "kind": "...", "path": "..."}`

**Frontmatter flag rules:**
- Every frontmatter field is a `--<field-name>` flag (kebab-case → snake_case)
- Array types: comma-separated (`--mentions a,b,c`)
- Reserved flags (built-in, work on any kind): `--kind`, `--slug`, `--content`, `--domain`

### Read & list

```bash
loopany artifact get <id>                        # raw markdown to stdout
loopany artifact get <id> --format json          # parsed JSON
loopany artifact list                            # all artifacts as JSON array
loopany artifact list --kind task                # filter by kind
loopany artifact list --status running           # filter by status
loopany artifact list --domain crm               # filter by domain
loopany artifact list --kind task --status todo  # combine
loopany artifact list --kind task --priority high # any frontmatter field
loopany artifact list --contains "retention"      # case-insensitive body substring
```

### Mutate

Artifacts are **append-only**. You can:

```bash
# Append an H2 section to body. If the section already exists, content is
# added under it — no duplicate headings.
loopany artifact append <id> --section Outcome --content "Alice signed today"

# Transition status (validated against kind's status machine)
loopany artifact status <id> running
loopany artifact status <id> done --reason "shipped"

# Update any non-status frontmatter field (priority, check_at, dismissed,
# domain, etc.). Rejected for --field status — use the status command.
loopany artifact set <id> --field priority --value high
loopany artifact set <id> --field dismissed --value true
loopany artifact set <id> --field domain --value crm
```

**Status transitions for `task`:**
```
todo      → running, done, cancelled
running   → in_review, done, failed, cancelled
in_review → done, failed, cancelled
```

**`done` requires `## Outcome` in body** — append it first or status flip will be rejected.

### Graph (references)

```bash
# Add an edge
loopany refs add --from <id> --to <id> --relation led-to

# Query
loopany refs <id>                                # outgoing (default)
loopany refs <id> --direction in                 # incoming
loopany refs <id> --direction both               # combined
loopany refs <id> --relation led-to              # filter by relation
loopany refs <id> --domain crm                   # only edges within a domain
```

> Only forward edges are stored. The reverse map is built in memory at query
> time. Convention: write the relation in one direction (e.g. `led-to`), use
> `--direction in` to find what something was led-to from.
> For relation vocabulary, see `skills/conventions/relations.md`.

### Followups (the cron-driven query)

```bash
loopany followups                                # default: --due today
loopany followups --domain crm                   # scope to a domain
loopany followups --due overdue                  # strictly past
loopany followups --due next-7d                  # next week
loopany followups --due today --include-done true  # include terminal-status
```

By default, **artifacts in terminal status (done / cancelled / failed) are
hidden** — derived from each kind's status machine. Use `--include-done true`
to see them.

## Step 6 — Conventions you must follow

Rules for *how* to work (immutability, outcomes, relation verbs, person
resolution) live in skill files. Read `skills/RESOLVER.md` first — it
dispatches to the right skill for the intent at hand. Architectural
constraints that apply to all artifact work (append-only, markdown +
frontmatter, agent proposes + human accepts) live in `CLAUDE.md`.

Direct pointers:

| Concern | Read |
|---|---|
| Logging what you observed | `skills/signal-capture.md` |
| Task body, `## Outcome`, status transitions | `skills/task-lifecycle.md` |
| Picking a relation verb (`led-to` vs `cites` ...) | `skills/conventions/relations.md` |
| Writing a learning or a skill-proposal | `skills/improve.md` |
| Accepting / rejecting skill-proposals | `skills/proposal-review.md` |
| Proactively recording work that just concluded (PR / incident / decision / signal / outcome) | `skills/capture-on-complete.md` |

### Domains (optional organizational scope)

A `domain` is a coarse tag for grouping artifacts — `crm`, `ads`, `fundraising`,
`personal`. Orthogonal to `goal` (which is a causal/ownership concept).

- Any artifact can have `--domain X` at creation or via `artifact set`.
- Domain values are free strings — you don't have to enable before using.
- To "officially enable" a domain and load its kind pack:
  `loopany domain enable crm`. Enabled domains are tracked in `config.yaml`.
- To ship custom kinds for a domain, drop them in
  `~/loopany/domains/<name>/kinds/*.md`. They load into the registry
  automatically when the domain is enabled — not before.
- `doctor` warns on artifacts using a domain that isn't in `enabled_domains`.

Typical flow:
```bash
# user writes a deal.md pack kind, then:
loopany domain enable crm
loopany artifact create --kind deal --domain crm --slug acme-q2 --title "..."
loopany artifact list --domain crm
loopany followups --domain crm
```

Disable (e.g. winding down a workstream) hides the pack's kinds but keeps
existing artifacts on disk — they stay listable under `--kind <core>` filters.

## Step 7 — Recurring jobs

loopany has no built-in scheduler. How cadence actually works depends
on the host — agent platforms (OpenClaw, Hermes) can register real
cron; coding CLIs (Claude Code, Codex) are session-bound, so the user
becomes the cron. Same three skills, two registration paths.

### The four recurring skills

Register **skills**, not raw CLI commands. Each skill fetches the data
it needs via `loopany ...` internally and decides what's worth
surfacing — a cron firing a plain query produces no judgment.

| Cadence | Skill                    | What it does                                                        |
|---------|--------------------------|---------------------------------------------------------------------|
| Daily   | `skills/followups.md`    | Surface today's due items; close each with a state transition       |
| Weekly  | `skills/health-check.md` | Doctor pass + overdue sweep + parking-lot sweep (stuck artifacts)   |
| Weekly  | `skills/improve.md`      | Reflect on fresh outcomes; write learnings + skill-proposals        |
| Monthly | `skills/goal-check.md`   | Detect goal-drift against recent task work; trigger re-onboarding   |

### If the host is an agent platform (OpenClaw / Hermes)

Register each skill on its cadence using the platform's cron
mechanism. Ensure the skill runs inside an agent session, not as a
bare shell command — the judgment is the point.

Record what you registered (job IDs, config paths) so a future
re-install can audit instead of duplicating.

### If the host is a coding CLI (Claude Code / Codex)

Sessions are ephemeral; there's no practical cron. The user is the
cron — teach the cadence and prompt at session boundaries.

- **Day start**: invoke the followups skill.
- **Weekly**: invoke the health-check skill; separately, when the user
  asks to reflect (or ≥3 tasks have flipped to `done` since last
  reflection), invoke improve.
- **Monthly** (or when the user asks "am I still working on the right
  thing"): invoke goal-check.

At the end of onboarding, tell the user these cadences exist and that
you'll prompt for them. Unreliable prompting is the failure mode — but
it's smaller than pretending cron works here.

## Step 8 — Verify

Run `loopany doctor`. Exit 0 = healthy, exit 1 = something to fix; the
report lists each failed check and the offending file or edge. Add
`--format json` for machine consumption.

## Reference: audit.jsonl

Every CLI invocation appends one line to `~/loopany/audit.jsonl`:

```jsonl
{"ts":"...","op":"artifact.create","kind":"task","id":"tsk-...","actor":"cli","duration_ms":12}
{"ts":"...","op":"artifact.status","id":"...","new_status":"done","actor":"cli","duration_ms":5}
{"ts":"...","op":"artifact.create","actor":"cli","duration_ms":2,"error":"Unknown kind: bogus"}
```

This is **not** the references graph (semantic links between artifacts).
It is the *operations* log — what the agent attempted and what happened.
Use it to debug "why didn't loopany do X?" or to compute metrics
("how many artifacts created this week").

## Reference: ID schemes

- **Time-bucketed kinds** (task, signal): `<prefix><YYYYMMDD>-<HHMMSS>`,
  optional `-2`/`-3` suffix on same-second collision.
  Example: `tsk-20260422-103045`
- **Flat entity kinds** (person): `<prefix><slug>`. Slug provided by caller.
  Example: `prs-alice-chen`

## Reference: file format

Every artifact is plain markdown:

```markdown
---
title: Follow up with Alice
status: running
priority: high
check_at: 2026-04-29
mentions:
  - prs-alice-chen
---
ping her about the contract

## Outcome

Alice signed today.
```

You can `cat` any artifact and it reads naturally. The runtime parses
frontmatter via standard YAML.
