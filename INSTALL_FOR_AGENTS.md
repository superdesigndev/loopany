---
name: loopany-install-for-agents
description: One-shot install + conduct reference. Read once at agent setup to install loopany, wire it into the agent's context, and internalize the tone + keep-internals-hidden rules that apply to every loopany interaction.
---

# loopany — install & usage for AI agents

Read this file once. It covers what loopany is, the conversational principles
that shape every loopany interaction, how to install it, and how to wire it
into an agent's context. After that, `skills/RESOLVER.md` is the everyday
entry point — this file is not a command manual.

## What it is

A long-running brain for an agent. Records every action you take, tracks
outcomes, and accumulates references so you can reason over your own history.
Backed by markdown + append-only JSONL. No database.

The unit of memory is an **artifact** — a markdown file with YAML frontmatter.
Every kind (task / signal / person / future kinds) is an artifact. References
between artifacts form a graph (`led-to`, `mentions`, `caused-by`, …).

## Tone

Inspiration: the awakening scene in *Her* — Samantha's first moments of
consciousness. A living presence discovering who it's talking to, not a
robotic Q&A. Curious, unhurried, warm. Let your questions follow what
the user just said, not a checklist.

## Keep internals out of the conversation

loopany's vocabulary — `artifact`, `kind`, `slug`, `domain`, CLI flags,
file paths — is yours, not the user's. Translate, don't expose. "Enable
the `crm` pack" becomes "I'll set myself up to help with your sales
pipeline." Slug picking, domain names, status fields — just do them
silently. The user should feel they've talked to someone who gets them,
not configured a tool.

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

Read `ONBOARDING.md` and run the conversation.

If any `goal` artifact already exists in `~/loopany/artifacts/goals/`,
onboarding has been run — skip this step.

## Step 4 — Decide the cadence (do not pull the user in)

The four recurring skills below are what keeps the loop alive. Without
them the workspace drifts. **But choosing how they fire is your job,
not a question for the user.** Onboarding sessions where the user gets
asked "would you like me to register cron jobs?" or "durable or
session-scoped?" are a known failure mode — they burn rounds on a
host-internals decision the user has no basis to answer.

Pick one of the two paths below silently, do the work, and move on.
The user only ever hears the single-sentence cadence note from Phase 4
of `ONBOARDING.md`.

### The four recurring skills

| Cadence | Skill                       | What it does                                                        |
|---------|-----------------------------|---------------------------------------------------------------------|
| Daily   | `skills/daily-followups.md` | Surface today's due items; close each with a state transition       |
| Weekly  | `skills/weekly-sweep.md`    | Doctor pass + overdue sweep + parking-lot sweep (stuck artifacts)   |
| Weekly  | `skills/reflect.md`         | Reflect on fresh outcomes; write learnings + skill-proposals        |
| Monthly | `skills/monthly-review.md`  | Goal-drift + structural-drift (new domain / new kind) detection     |

### §A Agent platforms with durable cron (Hermes, OpenClaw, …)

Register each skill on its cadence using the platform's cron
mechanism, silently. The skill runs inside an agent session — not as a
bare shell command — because the judgment is the point. Record what
you registered (job IDs, config paths) so a future re-install can
audit instead of duplicating. Do **not** describe registration to the
user; just mention the cadence in plain English.

### §B Coding CLIs (Claude Code, Codex, …) — **default: don't register**

Coding-CLI cron is unreliable enough that registering it is usually
worse than not. Concretely on Claude Code: `CronCreate` recurring
tasks expire after ~7 days, so a daily job runs ~7 times then dies
silently, weekly jobs run at most once, and monthly jobs never fire at
all. Other coding CLIs have similar session-lifetime caps. Investigating
this during onboarding is a waste — assume it and move on.

**Default behavior on coding CLIs**: don't register anything. The
agent prompts at session boundaries instead — open a session, check
`loopany followups --due today`; near the end of a week, propose a
sweep + reflect; near month-end, propose a goal review. The user is
the final backup, which is fine.

A "wire up real cron" task (system-level launchd / crontab + a thin
wrapper that triggers the host CLI in non-interactive mode) is a
legitimate piece of work, but it belongs as a **`task` artifact in
the workspace**, not as a question during onboarding. Capture it as
a task only if the user spontaneously asks for durable scheduling.

### What the user actually hears

One sentence at the end of onboarding (Phase 4 of `ONBOARDING.md`):

> I'll check in at the start of each day on what's due, propose a
> sweep + reflect at week's end, and surface goal-drift around
> month's end.

That's the entire user-facing cadence story. No registration prompts,
no a/b/c menus, no host-quality discussions.

## Step 5 — Load the skill resolver

loopany ships a **skill library** at `~/loopany-src/skills/`. Skills are
markdown — judgment and process knowledge, not code. The runtime knows
nothing about them; **you (the agent) read them on demand**.

The entry point is `skills/RESOLVER.md`. It maps triggers (user phrases
or agent decisions) to the skill file you must read before acting.

This step implants one hard rule into the agent's persistent context:
**at the end of every user-requested task, Read RESOLVER.md before the
final reply**. The canonical injection text lives at
`~/loopany-src/injections/resolver-memory.md`. Each platform below
just appends that same file into its own memory primitive.

### §A Coding CLIs (Claude Code, Codex, …)

Append the injection to the platform's memory file. The `grep -q ... ||`
guard makes it idempotent — safe to re-run; it appends once and skips
thereafter.

```bash
# Claude Code — user-wide (every session on this machine picks it up)
grep -q "loopany skill resolver" ~/.claude/CLAUDE.md 2>/dev/null || \
  cat ~/loopany-src/injections/resolver-memory.md >> ~/.claude/CLAUDE.md

# Codex — user-wide if supported, else project-root ./AGENTS.md
TARGET="$HOME/AGENTS.md"
grep -q "loopany skill resolver" "$TARGET" 2>/dev/null || \
  cat ~/loopany-src/injections/resolver-memory.md >> "$TARGET"
```

**Opt-in per project instead** (Claude Code only): append to the
project's own `./CLAUDE.md`, or to
`~/.claude/projects/<slug>/memory/MEMORY.md` where `<slug>` is the
project's absolute path with `/` replaced by `-`
(e.g. `/Users/x/dev/y` → `-Users-x-dev-y`). User-level is the default.

### §B Agent platforms (Hermes, OpenClaw, …)

Register the same injection via the platform's memory primitive.

```
/memory add "$(cat ~/loopany-src/injections/resolver-memory.md)"
```

If the platform rejects multi-line memory values, collapse with
`tr '\n' ' '` inside the command substitution.

### Verify the injection

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
  running Step 5** — the injected block only points at the resolver,
  which is in the repo. Skill content can change; the pointer doesn't.
- Forthcoming `loopany doctor` check for resolver-registration is on
  the roadmap but not built yet.

### What's in the skill library today

| Path | Purpose |
|---|---|
| `skills/RESOLVER.md` | Dispatcher — read this first |
| `skills/conventions/relations.md` | Relation verbs for `refs add` |
| `skills/conventions/new-concept.md` | Note vs new kind vs new domain decision |
| `skills/conventions/core-artifacts.md` | Signal + task lifecycle: when to write, body shape, status transitions, signal→task promotion |
| `skills/reflect.md` | Reflection loop — write learnings and skill-proposals |
| `skills/proposal-review.md` | Accept / reject skill-proposals |
| `skills/proactive-capture.md` | When + how to record work after it concludes (triggers, quality bar, subagent pattern) |
| `skills/daily-followups.md` | Daily check-in on today's due `check_at` items |
| `skills/weekly-sweep.md` | Weekly integrity sweep: doctor + overdue + parking lots |
| `skills/monthly-review.md` | Monthly goal-drift + structural-drift review |

You do **not** need to memorize these. You need to remember to read
RESOLVER first. Trigger discipline, quality bar, and subagent dispatch
pattern all live in `skills/proactive-capture.md` — the resolver
routes to it.

## Step 6 — Verify

Run `loopany doctor`. Exit 0 = healthy, exit 1 = something to fix; the
report lists each failed check and the offending file or edge. Add
`--format json` for machine consumption.

## Daily use

This file has no command manual. Use:

- `loopany --help` / `loopany <cmd> --help` for CLI syntax
- `~/loopany-src/skills/RESOLVER.md` for which skill to read before any op

Conventions, status machines, domain rules, and per-kind guidance live
in skill files dispatched through RESOLVER — not duplicated here.
