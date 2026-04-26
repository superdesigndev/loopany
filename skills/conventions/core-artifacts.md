---
name: loopany-core-artifacts
description: Lifecycle of the two work-loop artifacts — `signal` (aware of a problem/need, can't act now, or pending confirmation) and `task` (committing to do something). Covers creating, writing, dismissing, promoting signal→task, and closing tasks with `## Outcome`. Triggers — signal: "I should look into this later" / "TODO" / "this needs verifying" / unresolved-but-real findings; task: "let's do X" / `[change]` or `[incident]` markers / flipping a task to done/failed/cancelled. Usually read after [[../proactive-capture.md]] routes you here.
---

# core artifacts — `signal` and `task`

These two kinds carry the **work loop**: signal is "I noticed something
unresolved"; task is "I'm committing to do something." Other kinds
(`learning`, `skill-proposal`, `brief`) are downstream — they read
signal/task evidence to function.

## Quick map

| Kind | Trigger (state, not phrase) | Discipline | Closure |
|---|---|---|---|
| `signal` | aware of a problem/need but **can't act now**, or **pending confirmation** | ≤ 160-char `summary`, source-tagged, body optional | dismiss with reason, or upgrade to task |
| `task` | committing to work — fix-now intent, `[change]`, `[incident]`, ad-hoc | required `## Outcome` on `done`/`failed`; structured body for `[change]`/`[incident]` | status flip to terminal state |

The boundary that matters: **acting now → `task`**. **Deferred or
unverified → `signal`**. **Pure observation with nothing unresolved → don't
write anything** (or a `note`, if the rationale is worth preserving).

---

# Signals — the deferred-attention slot

A signal exists because something is **noticed but unresolved**:

- Already aware of a problem or need, but **can't fix it now** (other work
  in the way, scope mismatch, no time).
- **Pending confirmation** — you suspect X but haven't verified.
- Real but lower priority than current focus, and you want future-you to
  come back to it.

A signal is not a task (no commitment to act), not a note (must be
cite-worthy weeks later), not a thought (has to be concrete). The cost of
a bad signal is worse than the cost of a missed one — noisy signals
pollute [[../reflect.md]] and dilute dismissal decisions.

## When to create

All three must hold:

1. **Concrete observable** — file path, session ID, PostHog event, commit,
   conversation. Not "I have a vibe."
2. **Actionable in principle** — some plausible future task could address
   it. "The sky is blue" isn't actionable.
3. **Not already captured** — search first:

   ```bash
   loopany artifact list --kind signal --contains "<key phrase>"
   ```

   Match? Append evidence (don't fork) — see "Recurring signals" below.

## When NOT to create

- **About to act on it now** → create a `task` directly with the
  observation in its body. Signals are for deferred attention.
- **One-off nit with no plausible recurrence** (typo in a log line) — fix
  or drop.
- **Belief, not observation** ("I think our auth is fragile") — that's a
  `learning` candidate, only after a pattern emerges across multiple
  artifacts. See [[../reflect.md]].
- **Duplicate with zero new evidence** — append to the existing one.

## Source — pick one

`source` is indexed; monthly review slices by it. Four cover most cases:

| Source | Meaning |
|--------|---------|
| `cost` | Money / tokens / machine-hours wasted or at risk |
| `architecture` | Structural issue: coupling, missing abstraction, design drift |
| `observability` | "I only noticed because I happened to look" — gap in automatic visibility |
| `user-feedback` | Someone reported or reacted to something |

Other values are allowed (open registry), but if you reach for a fifth, ask
whether it could collapse into one of these with a better framing.

## Writing the `summary`

`summary` is the **primary searchable text** — `--contains` hits it. The
body might not be read for weeks; the summary stands alone.

- **≤ 160 chars** — roughly one terminal line.
- **Lead with the failure mode / symptom**, then mechanism.
- **Name the thing** — file path, tool name, PR number when relevant.

```yaml
# Good
summary: "upload_image base64-encodes video → >5MB → PayloadTooLargeError → circuit breaker"

# Too vague
summary: "video uploads sometimes fail"

# Too long (push detail to body)
summary: "When the user attempts to upload a video via the ads-manager subagent..."
```

## Body — when to add it

Optional but recommended for any signal you'll want to revisit:

- **Where observed** — file path, session, date
- **Mechanism** — why this happens, not just what happened
- **Risk** — cost vs stability vs data-loss; rough scale if known
- **Fix direction (not a plan)** — one sentence of "what might this look
  like" without committing to a task

If summary + source say it all, skip the body. Noise-free is fine.

## Frontmatter template

```bash
loopany artifact create --kind signal \
  --summary "<one-line observable>" \
  --source <cost|architecture|observability|user-feedback> \
  --domain <domain> \
  --mentions "<entity-ids>" \
  --content "$(cat <<'EOF'
Observed <when/where>. <mechanism in 1-2 sentences>.

**Risk:** <cost|stability|data-loss|etc.>
**Fix direction (not yet a task):** <sentence>.
EOF
)"
```

## Dismissing a signal

`status: dismissed` means "noted, no action planned." Flip when:

- Investigated and concluded false positive.
- Duplicated by a stronger signal you're keeping.
- Underlying condition went away (library upgrade, refactor moot).

```bash
loopany artifact status <sig-id> dismissed --reason "..."
loopany artifact append <sig-id> --section "Dismissal" --content "..."
```

**Record why.** Future [[../reflect.md]] runs read dismissed signals — "why
does this class keep getting ignored?" is a real pattern. A dismissal
without a reason is useless evidence. Don't dismiss to keep the list
tidy — dismissal is a claim that the signal isn't worth acting on, and
that claim should survive a retrospective.

## Recurring signals

If you're about to write a signal whose summary near-matches an existing
one, **don't fork**:

- **Append evidence** to the existing one:
  ```bash
  loopany artifact append sig-... --section "Recurrences" \
    --content "2026-04-22: seen again in session X. Same mechanism."
  ```
- **Promote to task** if recurrence count crosses 3 in ≤ 2 weeks.
- **Call it a blindspot**: if you only noticed because you happened to
  look, source = `observability`.

Reflect relies on recurrence being visible in one place to spot patterns.
Fragmenting across duplicates breaks that.

---

# Tasks — the commitment slot

A `task` is "I'm doing this." When it flips to `done`, the body has
`## Outcome` explaining what actually happened. [[../reflect.md]] reads
these outcomes; weak outcomes produce weak learnings, and that's how the
self-improvement loop fails silently.

## Three shapes

Prefix the title — monthly reviews slice work by it:

| Prefix | When | Required body sections |
|--------|------|------------------------|
| `[change]` | Intentional change to move a metric or fix a class of issue | `## Hypothesis`, `## Before`, `## Outcome` |
| `[incident]` | Something broke; you're responding | `## What broke`, `## Root cause`, `## Fix`, `## Outcome` |
| (no prefix) | Ad-hoc — follow-ups, investigations, errands | `## Outcome` always |

Default to `[change]` or `[incident]` when in doubt. The prefix-less shape
is for genuinely amorphous work; if it has a hypothesis *or* a root cause,
it belongs in one of the structured shapes.

## Creating a task

### From a signal — see "Signal → Task promotion" below

### Standalone — check for existing first

```bash
loopany artifact list --kind task --contains "<key phrase>"
```

Near-duplicate in `todo` or `running`? Append or link with `follows-up`.
Don't fork the thread.

### Scheduled — `check_at` for future review

```bash
loopany artifact create --kind task \
  --title "[change] <...>" --status todo \
  --check-at 2026-05-13   # 3 weeks for metric to settle
```

`check_at` is read by `loopany followups` — it's how future-you finds this
task to fill in `## Outcome` later.

## Body sections

### `## Hypothesis` (for `[change]`)

What you expect to move, and why. **One hypothesis, not three.** If you
have three, pick the strongest or split into three tasks.

```markdown
## Hypothesis
Shrinking PostHog tool response payloads will cut input tokens on the next
turn. With #450 locking the prompt cache prefix, savings compound — each
tool's reduction is paid for once per session, not once per turn.
```

Don't say "I think X will happen." Say "X will happen, because Y."

### `## Before` (for `[change]`) — required, otherwise the change is unfalsifiable

The observable metric **before** you ship. Without it, the eventual Outcome
can't tell whether anything moved — only that you shipped.

```markdown
## Before
- $/session (3-session avg, 2026-04-14): $0.87
- cache_hit on turn 2+ (Langfuse 24h): 42%
- payload size for `query_events`: ~18 KB avg
```

If you can't get a number, **say so explicitly** and name what you
checked. A `## Before` that reads "No baseline captured — this is a
structural refactor with no directly measurable target" is honest — it
documents the absence, and the resulting outcome must match ("shipped; no
delta to measure").

You can ship without a `## Before`, but expect the outcome to be weak
evidence — reflect can't learn from it.

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
2. Injected `stop_config: 300s` meant old processes stuck waited 300s
   instead of 5s.

## Fix
Grep all call sites of `waitForStarted` and align; reassessed
`stop_config` against old-code behavior.
```

No hypothesis on `[incident]` — you're not testing a theory, you're
repairing reality.

### `## Outcome` — the section reflect actually reads

Quality of outcomes determines quality of learnings. Three questions the
outcome must answer:

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

Compounded with #450 as hypothesized — standalone payload shrink on the
old code would have been much smaller.

**Do differently**: capture a 3-session baseline *before* shipping, not
after. I had to estimate "before" from spotty earlier sessions.
```

Honest outcomes are the ones that pay off. A fake-positive ("shipped;
everything is better!") teaches nothing and pollutes reflect. If the
change didn't work, say so — that's more valuable than a weakly-justified
win.

### `## Follow-up` (optional, any shape)

Threads neither "next action" (→ new task) nor "learning" (→ needs
pattern across multiple tasks):

```markdown
## Follow-up
- [ ] Consider CI lint for "new default with hardcoded callers" (no task yet)
- [ ] Revisit cold-start timeout 3 months from now (2026-07-22)
```

## Status transitions

```
todo ──┬── running       ... started working
       └── cancelled     ... decided not to do, never started
                             (no Outcome required on cancelled-from-todo)

running ──┬── in_review  ... PR open / waiting external
          ├── done       ... finished, Outcome written
          ├── failed     ... attempted, didn't work, giving up
          └── cancelled  ... abandoned mid-flight

in_review ──┬── done     ... merged / approved
            ├── failed   ... rejected / won't land
            └── cancelled

done | failed | cancelled  ... terminal
```

### `done` vs `failed` vs `cancelled`

- **done** — the thing shipped. Outcome may be "metric didn't move" — that
  still counts as done. "Shipped and neutral" is valid data.
- **failed** — attempted but couldn't deliver. The attempt itself produced
  evidence (what blocked it? which assumption was wrong?). Write a full
  Outcome explaining the failure.
- **cancelled** — decided not to do it. Minimal Outcome: one sentence of
  why.

`failed` is information. Don't downgrade failed tasks to cancelled to keep
the list looking cleaner — reflect needs to see what didn't work, or it
can't help you learn from it.

### Required Outcome gate

The kind enforces: `done` / `failed` requires `## Outcome` in body. CLI
rejects the transition otherwise. Write Outcome first:

```bash
loopany artifact append <id> --section Outcome --content "..."
loopany artifact status <id> done --reason "<one line>"
```

## `check_at` — scheduling future review

Read by `loopany followups --due today`. Pick by task shape:

| Task shape | Default `check_at` |
|------------|--------------------|
| `[change]` — infrastructure / perf | 2-4 weeks out |
| `[change]` — architecture refactor | 1-3 months out |
| `[change]` — prompt / small tweak | 1 week out |
| `[incident]` | 1 month out — "did it recur?" |
| Ad-hoc task | none unless explicitly needed |

The point of `check_at` is to come back and fill in (or assess) the
Outcome. Don't set it without a concrete question you'll answer when it
fires. Unsure? Leave blank. Missing `check_at` is better than a date
you'll ignore.

## Scheduling follow-up tasks

When today's task points to future work:

```bash
# Today's task closing
loopany artifact status tsk-today done --reason "shipped, metric landed"

# Future task for a 2-week recheck
loopany artifact create --kind task \
  --title "[change] recheck #447 compounding effect with #451-#453" \
  --status todo --check-at 2026-05-06

loopany refs add --from tsk-future --to tsk-today --relation follows-up
```

`follows-up` (not `led-to`) — the future task continues the thread. See
[[./relations.md]].

---

# Signal → Task promotion

When a signal crosses from "noted" to "doing":

```bash
loopany artifact create --kind task \
  --title "[change] add upload_video tool to meta-ads plugin" \
  --status todo --priority high \
  --content "..."

loopany refs add --from tsk-... --to sig-... --relation addresses
```

Use `addresses` (not `led-to`) — the task claims responsibility for
resolving the observation. See [[./relations.md]].

**Don't dismiss the signal when creating the task.** The `refs` edge is
the link. The signal stays "live" until the task it addresses is `done`
with a real Outcome — then dismiss with reason "addressed by tsk-...".

---

# Anti-patterns (combined)

### ❌ Creating signals just in case

"Not sure if this matters, but I'll log it." → reflect later reads 30 weak
signals and finds no pattern. Default skip. You can always create later
when a second instance makes it real.

### ❌ Treating signal as a scratch pad

Body full of exploratory notes with no conclusion. Use a memory file for
that; signals should be cite-worthy weeks later.

### ❌ Source = "other" or blank

The source field is the first filter for monthly review. "other" = dark
matter. Force a classification or don't create.

### ❌ Summary as a sentence fragment

"announce lock issue" — too thin, unsearchable. Full observable: "Announce
handler has no session lock — parallel runAgentLoop on same session."

### ❌ Dismissing without a reason

The dismissal IS evidence. Treating it as janitorial action loses that.

### ❌ "[change]" task with no `## Before`

Hypothesis without a baseline → un-evaluable Outcome. Capture a baseline,
or downgrade to ad-hoc (no prefix, no Hypothesis/Before demands).

### ❌ Outcome written same-day as `done`, always

Some tasks resolve immediately — fine. But a *pattern* of same-day
Outcomes across `[change]` tasks means you're not waiting long enough for
the metric to settle. Use `check_at`.

### ❌ Outcome that reads "Shipped. It works."

Not evidence. For `[change]`: measure against the Before. For
`[incident]`: answer "is this a repeat root cause?"

### ❌ Silent task rewrite

Artifacts are append-only. Don't edit Hypothesis after the outcome
disappointed you — write the honest Outcome instead. If the hypothesis
was wrong, that's exactly what reflect needs.

### ❌ Using `running` as a parking lot

Long-running `running` tasks block follow-up queries. Blocked externally →
`in_review`. Abandoned → `failed` or `cancelled` with Outcome.

### ❌ Title without prefix when the shape demands one

`"Upload video tool"` — change? incident? investigation? A readable title
tells the reader (and reflect) what body sections to expect.

### ❌ Using `task` as an entity holder

Tweet, post, customer, order, paper, PR, episode — these are entities that
exist in the world, not work-with-an-outcome. tasks require
`## Hypothesis → ## Before → ## Outcome`; if your candidate doesn't have
that shape, it's a `note` or a custom `kind` — see [[./new-concept.md]].
Same activity often produces both a `task` ("write the post") and an
entity ("the post itself"), linked via `produced`. Don't replace.

---

# Quick reference

```
SIGNAL  state-trigger: aware + can't-act-now OR pending-confirmation
        gate:          concrete + actionable + not-yet-captured
        write:         ≤160-char summary · pick a source · body optional
        close:         dismiss with reason · or promote to task (`addresses`)
        recurring:     append evidence · ≥3 in 2wk → promote

TASK    state-trigger: committing to act
        shape:         [change] / [incident] / (ad-hoc, no prefix)
        body:          [change] → Hypothesis + Before (required) + Outcome
                       [incident] → What broke + Root cause + Fix + Outcome
                       ad-hoc → Outcome
        close:         flip to done/failed → CLI requires Outcome
        check_at:      "when should future-me come back to assess this?"

LINK    signal → task:        `addresses`
        next-step → prior:    `follows-up`
        brief → cited tasks:  `cites`
```

One task = one hypothesis = one outcome. If you want three, write three.
