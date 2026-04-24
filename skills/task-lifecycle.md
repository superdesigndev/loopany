---
name: loopany-task-lifecycle
description: Create, append to, and close `task` artifacts with the required `## Outcome` discipline. Three shapes — [change], [incident], ad-hoc. Use whenever starting work, updating progress, or flipping a task to done.
---

# task-lifecycle — creating, writing, and closing `task` artifacts

The main loop. A `task` carries its own outcome record — when it flips to
`done`, the body has `## Outcome` explaining what actually happened.
[[./improve.md]] reads these outcomes.** Weak outcomes produce weak learnings.

The discipline in this skill is what makes the self-improvement loop
non-trivial. Cutting corners here defeats the whole system.

## Three shapes of task

Prefix the title. The prefix is how monthly reviews slice the work:

| Prefix | When to use | Required body sections |
|--------|-------------|-----------------------|
| `[change]` | Intentional change you're shipping to move a metric or fix a class of issue | `## Hypothesis`, `## Before`, `## Outcome` |
| `[incident]` | Something broke; you're responding | `## What broke`, `## Root cause`, `## Fix`, `## Outcome` |
| (no prefix) | Ad-hoc work that doesn't fit either — follow-ups, investigations, errands | `## Outcome` (always) |

**Default to `[change]` or `[incident]` when in doubt.** The prefix-less
shape is for genuinely amorphous work (answering a user question,
checking out a repo). If it has a hypothesis *or* a root cause, it
belongs in one of the two structured shapes.

## Creating a task

### From a signal

If you're acting on a signal, link with `addresses`:

```bash
loopany artifact create --kind task \
  --title "[change] add upload_video tool to meta-ads plugin" \
  --status todo \
  --priority high \
  --content "(see Hypothesis / Before / Outcome below — fill in)"

loopany refs add --from tsk-... --to sig-... --relation addresses
```

See `skills/signal-capture.md` § "Upgrading a signal to a task".

### Standalone

No signal? Still check for related existing work first:

```bash
loopany artifact list --kind task --contains "<key phrase>"
```

If you find a near-duplicate in `todo` or `running`, append to it or link
with `follows-up` — don't fork the thread.

### Scheduled future task

A `[change]` with an outcome window 1-3 weeks out:

```bash
loopany artifact create --kind task \
  --title "[change] <...>" --status todo \
  --check-at 2026-05-13 \   # 3 weeks for metric to settle
  ...
```

`check_at` is read by `loopany followups` — it's how future-you finds
this task to fill in `## Outcome`.

## Writing body sections

### `## Hypothesis` (for `[change]`)

What you expect to move, and why. **One hypothesis, not three.** If you
have three, either pick the strongest or split into three tasks.

```markdown
## Hypothesis
Shrinking PostHog/Google Ads tool response payloads will cut input tokens
on the next turn. With #450 locking the prompt cache prefix, the savings
compound — each tool's reduction is paid for once per session, not once
per turn.
```

Don't say "I think X will happen." Say "X will happen, because Y."

### `## Before` (for `[change]`) — **MANDATORY, or it's a vibes change**

The observable metric **before** you ship. Format:

```markdown
## Before
- $/session (3-session avg, 2026-04-14): $0.87
- cache_hit on turn 2+ (Langfuse 24h): 42%
- payload size for `query_events`: ~18 KB avg
```

If you can't get a number, **say so explicitly** and name what you
checked. A `## Before` that reads "No baseline captured — this is a
structural refactor with no directly measurable target" is still
honest — it documents the absence, and the resulting outcome must match
("shipped; no delta to measure").

**A `[change]` task without a `## Before` is unfalsifiable.** You can
ship without one, but you should expect the outcome to be weak evidence.
The `improve` skill's first-order rule: weak-Before → can't learn from
the outcome.

### `## What broke` / `## Root cause` / `## Fix` (for `[incident]`)

Separate facts from explanation:

```markdown
## What broke
Full deploy failure on 2026-04-10 at 14:23 UTC. Console-api 100% 5xx for
~4 minutes.

## Root cause
Two compounding causes:
1. `waitForStarted` default changed to 360s but call site hardcoded 120s
   — silent override.
2. Injected `stop_config: 300s` meant old processes that were stuck now
   waited 300s to exit instead of 5s.

## Fix
Grep all call sites of `waitForStarted` and align; reassessed
`stop_config` against old-code behavior.
```

No hypothesis on `[incident]` — you're not testing a theory, you're
repairing reality.

### `## Outcome` — **THE POINT**

This is what `improve` reads. The quality of outcomes determines the
quality of learnings. Three questions the outcome must answer:

1. **What shipped?** (for `[change]`) / **Is it fixed?** (for `[incident]`)
2. **Did it move the metric?** (for `[change]`) / **What's the lesson?**
   (for `[incident]`)
3. **What would you do differently?** (any task)

```markdown
## Outcome
Shipped #447 on 2026-04-18. Measured:
- $/session (3-session avg, 2026-04-20): $0.61 (−30%)
- cache_hit on turn 2+: 67% (+25pp)
- `query_events` payload: ~4 KB avg (−78%)

Compounded with the cache-stability change (#450) as hypothesized —
standalone payload shrink on the old code would have been much smaller.

**Do differently**: capture a 3-session baseline *before* shipping, not
after. I had to estimate "before" from spotty earlier sessions.
```

**Honest outcomes are the ones that pay off.** A fake-positive outcome
("shipped; everything is better!") teaches nothing and pollutes
`improve`. If the change didn't work, say so — that's more valuable than
a weakly-justified win.

### `## Follow-up` (optional, any shape)

If this task surfaces work for later:

```markdown
## Follow-up
- [ ] Consider CI lint for "new default with hardcoded callers" (no task yet)
- [ ] Revisit cold-start timeout 3 months from now (2026-07-22)
```

List items that are neither "next action" (→ new task) nor "learning"
(→ needs pattern across multiple tasks) — just threads you want visible.

## Status transitions — decision tree

```
todo ──┬── running       ... started working
       └── cancelled     ... decided not to do it, never started
                             (no Outcome required on cancelled-from-todo)

running ──┬── in_review  ... PR open / waiting external
          ├── done        ... finished, Outcome written
          ├── failed      ... attempted, didn't work, giving up
          └── cancelled   ... abandoned mid-flight

in_review ──┬── done      ... merged / approved
            ├── failed    ... rejected / won't land
            └── cancelled

done      ... terminal (no transitions)
failed    ... terminal
cancelled ... terminal
```

### `done` vs `failed` vs `cancelled`

- **done** — the thing shipped. Outcome may be "metric didn't move" — that
  still counts as done. "Shipped and neutral" is valid data.
- **failed** — attempted but could not deliver. The attempt itself
  produced evidence (what blocked it? which assumption was wrong?). Write
  a full Outcome explaining the failure.
- **cancelled** — decided not to do it. Minimal Outcome: one sentence of
  why.

**`failed` is information.** Don't downgrade failed tasks to cancelled to
keep the list looking cleaner. The `improve` skill needs to see what
didn't work.

### Required Outcome gate

The kind enforces: `done` / `failed` transitions require `## Outcome` in
body. The CLI will reject the transition otherwise. Write Outcome first:

```bash
loopany artifact append <id> --section Outcome --content "..."
loopany artifact status <id> done --reason "<one line>"
```

## `check_at` — when should future-me look at this?

The `check_at` date is how `loopany followups --due today` pulls tasks
back into view. Pick it based on the task shape:

| Task shape | Default `check_at` |
|------------|---------------------|
| `[change]` — infrastructure / perf | 2-4 weeks out |
| `[change]` — architecture refactor | 1-3 months out |
| `[change]` — prompt / small tweak | 1 week out |
| `[incident]` | 1 month out — "did it recur?" |
| Ad-hoc task | no `check_at` unless explicitly needed |

**The point of `check_at` is to come back and fill in the Outcome,** or
to assess whether the Outcome was real. Don't set it without a concrete
question you'll answer when it fires.

If you're unsure: leave it blank. Missing `check_at` is better than a
date you'll ignore.

## Scheduling follow-up tasks

When today's task's outcome points to future work:

```bash
# Today's task closing
loopany artifact status tsk-today done --reason "shipped, metric landed"

# Future task for a 2-week recheck — check_at is the followup hook
loopany artifact create --kind task \
  --title "[change] recheck #447 compounding effect with #451-#453" \
  --status todo \
  --check-at 2026-05-06

# Link them
loopany refs add --from tsk-future --to tsk-today --relation follows-up
```

`follows-up` (not `led-to`) — the future task continues the thread. See
`skills/conventions/relations.md`.

## Anti-patterns

### ❌ "[change]" with no `## Before`

You wrote a hypothesis and shipped. Without a before-number, the Outcome
is un-evaluable. Either capture a baseline or downgrade the task to
"exploratory" (no prefix, no Hypothesis/Before demands — just Outcome).

### ❌ Outcome written the same day as status `done`, always

Not wrong per se — some tasks genuinely resolve immediately. But a
pattern of same-day Outcomes across `[change]` tasks means you're not
waiting long enough for the metric to settle. Use `check_at` and come
back.

### ❌ Outcome that reads "Shipped. It works."

That is not evidence. For `[change]`: measure against the Before. For
`[incident]`: answer "is this a repeat root cause?"

### ❌ Silent task rewrite

Artifacts are append-only. Don't edit the Hypothesis after the outcome
disappointed you. Instead: write the honest Outcome, and if the
hypothesis was wrong, that's precisely what `improve` needs to see.

### ❌ Using `running` as a parking lot

Long-running `running` tasks block follow-up queries. If a task is
blocked on something external, either: flip to `in_review` (if waiting
on PR / review), or close with `failed` / `cancelled` and create a
follow-up task when unblocked.

### ❌ Titles without prefix when the shape demands one

`"Upload video tool"` — what is this? A change? An incident? An
investigation? A readable title tells the reader (or `improve`) what
body sections to expect. Prefix or rename.

## Quick reference

```
CREATE:  prefix + title, set priority, skeleton body
RUN:     flip todo→running, fill Hypothesis (and Before for [change]!)
CLOSE:   append Outcome → status done/failed → optional check_at for recheck
LINK:    signal → `addresses`, prior task → `follows-up`, brief → `cites`
```

One task = one hypothesis = one outcome. If you want three, write three.
