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

Before recording any artifacts, run the onboarding conversation.

A loopany brain without a goal is a filing cabinet, not a brain. The
goal is what gives every later artifact meaning — without it you don't
know whether what you're recording matters.

```bash
# After init, the agent reads ONBOARDING.md and runs the conversation:
cat ONBOARDING.md          # the script
```

Outcome of onboarding (two artifacts created via `loopany artifact create`):

1. **`prs-self`** — `person` artifact for the user. Frontmatter holds
   stable identity; body holds current role + stakeholders.
2. **`gol-<slug>`** — `goal` artifact (`status: active`) capturing what the
   brain is for. One-sentence title + why-it-matters body.

Optional: 2–4 stakeholder `person` artifacts for people named in onboarding.

There is **no `profile.md` and no `goals.md`** — both pieces are first-class
artifacts.

**Do not proceed past this step on a fresh workspace.** `loopany init`
itself reminds you with a "NEXT — read ONBOARDING.md" line; honor it.

If any `goal` artifact exists in `~/loopany/artifacts/goals/`, onboarding has
been run — skip to Step 5.

## Step 4 — Load the skill resolver

loopany ships a **skill library** at `~/loopany-src/skills/`. Skills are
markdown files — judgment and process knowledge, not code. The runtime
knows nothing about them; **you (the agent) read them on demand**.

The entry point is `skills/RESOLVER.md`. It maps triggers (user phrases
or agent decisions) to the skill file you must read before acting.

### Install the resolver into your agent's context

**Do this once per workspace.** The exact mechanism depends on your host
agent; the goal is identical: ensure **every future session** knows
"loopany's skill dispatcher is at `~/loopany-src/skills/RESOLVER.md` —
read it before any `artifact` operation."

#### Claude Code

Append a short reminder to the auto-memory file for this working
directory (it loads into every session automatically):

```bash
# Open the memory index for the current project
# (Claude Code writes to ~/.claude/projects/<project-slug>/memory/MEMORY.md)
# Add one line pointing at the resolver:
echo "- [loopany skill resolver](loopany_resolver.md) — read this before any loopany artifact op" \
  >> ~/.claude/projects/<project-slug>/memory/MEMORY.md

# And create the memory file itself:
cat > ~/.claude/projects/<project-slug>/memory/loopany_resolver.md <<'EOF'
---
name: loopany skill resolver
description: loopany's skill dispatcher — read RESOLVER before any artifact op
type: reference
---

loopany is installed at `~/loopany-src/`. Before any `loopany artifact *`
call, `loopany refs *` call, or reflection work, read:

    ~/loopany-src/skills/RESOLVER.md

The resolver maps the current intent to a specific skill file to load.
Conventions in `~/loopany-src/skills/conventions/` apply on top of every
skill.
EOF
```

(Replace `<project-slug>` with the actual slug Claude Code uses for
this project directory — usually the path with `/` → `-`.)

#### Hermes Agent

Hermes has multi-platform messaging and a built-in cron; skill discovery
is via its memory layer. Add the resolver to Hermes memory:

```
/memory add "loopany skill resolver: read ~/loopany-src/skills/RESOLVER.md
 before any artifact op. Conventions in skills/conventions/ apply on top
 of every skill."
```

#### OpenClaw

Declare loopany's skills in the OpenClaw plugin manifest so they're
loaded automatically. (This is the only platform with code-level skill
registration; everywhere else is prompt-driven.) See the OpenClaw
plugin docs for the exact `openclaw.plugin.json` shape.

#### Other agents (Codex, custom, MCP-only)

No standard mechanism — fall back to the universal path: at the top of
your system prompt or project-level instructions, add:

> "loopany is installed at `~/loopany-src/`. Before any `loopany
> artifact` operation, Read `~/loopany-src/skills/RESOLVER.md` and
> follow its dispatch table."

### Verify the loader works

Start a fresh session and ask yourself "where is the loopany skill
resolver?" — if you can answer `~/loopany-src/skills/RESOLVER.md`
without looking, the memory / system-prompt injection worked. If not,
re-install per the section above.

### What's in the skill library today

| Path | Purpose |
|---|---|
| `skills/RESOLVER.md` | Dispatcher — read this first |
| `skills/conventions/relations.md` | Relation verbs for `refs add` |
| `skills/signal-capture.md` | When to log a signal, how to write it |
| `skills/task-lifecycle.md` | Task shapes, body sections, status transitions, Outcome standards |
| `skills/improve.md` | Reflection loop — write learnings and skill-proposals |
| `skills/proposal-review.md` | Accept / reject skill-proposals |

You do **not** need to memorize these. You need to remember to read
RESOLVER first.

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

### Immutability

- **Never edit an artifact file in place.** Use `artifact append` to add
  sections; use `artifact status` to flip status (the runtime rewrites the
  file atomically). Direct file edits will desync the index.
- Artifacts stay forever. There is no delete.

### Outcomes

- When you complete a `task`, **append `## Outcome` describing what happened
  and why** before flipping to `done`. The self-improvement loop reads these.
- "Why" matters more than "what". The `improve` skill pattern-matches
  these outcomes later to propose skill changes.

### Person resolution

When the user mentions someone:
1. Run `loopany artifact list --kind person` and scan
2. If exactly one match by name or alias, use that ID
3. If multiple matches, ask the user which one
4. If none, create a new person with `loopany artifact create --kind person --slug <kebab-name> --name "..."`

The slug must be unique. `prs-alice-chen-acme` if you have two Alice Chens.

### References

- Use `--mentions <id1>,<id2>` in frontmatter when you reference an entity
- Use `loopany refs add` for stronger semantic links (`led-to`, `addresses`,
  `supersedes`, `follows-up`, `cites`)
- Avoid: writing both `led-to` and `caused-by` for the same fact — that
  duplicates the edge. Pick one direction; queries handle the other.
- **Vocabulary reference**: `skills/conventions/relations.md` — always use
  verbs from there rather than inventing synonyms.

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

loopany has **no built-in scheduler**. Use Claude Code's `/loop` slash command
or your platform's cron to fire periodic queries:

```
/loop 1d loopany followups --due today
/loop 1d loopany artifact list --status running
```

When the agent gets a non-empty followups list, work through it — check the
task body, do the work, append `## Outcome`, flip status to `done`.

## Step 8 — Verify

The single command:

```bash
loopany doctor
```

Checks all of: workspace exists, kinds parse, artifact frontmatter validates,
references graph has no dangling edges, onboarding complete (prs-self +
≥ 1 active goal). Exit 0 = healthy, exit 1 = something to fix.

For machine consumption:

```bash
loopany doctor --format json
```

Returns `{ workspace, checks: [{name, status, detail, problems?}], ok }`.

If `Onboarding` shows incomplete, run Step 3.
For `References DANGLING`, find the offending edge in
`~/loopany/references.jsonl` and either create the missing artifact or
edit the line out.

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
