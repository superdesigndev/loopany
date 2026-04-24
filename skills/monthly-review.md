---
name: loopany-monthly-review
description: Use on monthly cadence or when the user asks "is this still the right goal?" / "should we reset?" / "anything structural worth locking in?". Detects two drifts — (1) goal drift: active `goal` no longer matches recent tasks; (2) structural drift: recurring usage that should crystallize into a new `domain` or `kind`. Surfaces evidence; user decides.
---

# monthly-review — goal-drift + structural-drift detection

Two kinds of drift accumulate silently over a month:

1. **Goal drift** — the active `goal` no longer describes the
   user's actual work. Feeds `ONBOARDING.md`'s re-run trigger.
2. **Structural drift** — a recurring theme hasn't crystallized
   into a `domain` or `kind` yet.

Neither auto-acts. Surface evidence; the user decides.

## When to run this

- Scheduled: once per month (agent platforms)
- On demand: user asks "is this still the right goal," "should we
  reset," "anything structural worth locking in?"

**Never weekly.** One week of task data is too small to tell drift
from noise.

## Step 1 — Pull the goal and recent tasks

```bash
loopany artifact list --kind goal --status active
loopany artifact list --kind task   # filter by id prefix to last 30d
```

## Step 2 — Compute alignment

For each active goal:

```
alignment = tasks mentioning this goal / total recent tasks
             (restricted to the goal's domain, if it has one)
```

Thresholds:

- **≥ 60%** — healthy. No action.
- **30–60%** — partial drift. Ask whether the stray tasks actually
  serve the goal (missing `--mentions` backfill) or a second goal
  is worth locking in.
- **< 30%** — clear drift. Propose re-running onboarding.

Weight toward recent originals. `[backfill]` tasks seeded during
onboarding don't reflect current intent.

## Step 3 — Surface to the user

All goals healthy → one-line note, done.

Drift detected → present concretely, with evidence:

```
Drift on `gol-mrr-growth` (active since 2026-01):
- 23 tasks in the last 30 days, 6 mention this goal (26%)
- The other 17: mostly hiring + infra work

Two options:
1. Hiring/infra actually serves MRR — backfill the mentions
2. MRR isn't the main thing anymore — re-run onboarding
```

## Step 4 — Act

- **Backfill** → batch-update `--mentions` on affected tasks.
- **Re-run onboarding** → flip the old goal to `superseded`, create
  the new one, add the `supersedes` edge. See `ONBOARDING.md` §
  "When to re-run onboarding."
- **Neither** → push this skill's `check_at` 2–4 weeks with a
  reason. "Revisit after launch" is a reason; "dunno yet" isn't.

## Step 5 — Structural drift (new domain? new kind?)

**Don't multiply entities beyond necessity.** Most months both
checks come back empty, and that's healthy.

### 5a. Emerging `domain`

```bash
loopany domain list            # shows `observed_only`
loopany doctor --format json   # `domain coverage` lists offenders
```

**Proposal threshold** — all three must hold:

- ≥ 5 artifacts use the same unenabled domain value
- Usage spans ≥ 2 weeks (not a single burst)
- The domain is distinguishable from every enabled one — if it's a
  re-label of an existing one, rename, don't add

If met, propose a `[change]` task (standard shape, see
[[./conventions/core-artifacts.md]]). The structural-specific content:

- `## Hypothesis` — "treating `xyz` as its own domain clears
  doctor's coverage warnings and makes `artifact list --domain xyz`
  a useful query"
- `## Before` — the N ids currently tagged `domain: xyz`
- `## Sweep plan` — **real sweep** (domain is a tag, safe to
  retroactively reassign):
    1. `loopany domain enable xyz`
    2. For each id: `loopany artifact set <id> --field domain --value xyz`
    3. `loopany doctor` — confirm domain-coverage clean

### 5b. Emerging `kind`

```bash
loopany artifact list --kind note   # then read bodies
```

Looking for **repeating body shape** — same section headings, same
fields at the top. Not "notes about the same topic" — notes that
*look structurally alike*.

**Proposal threshold** — both must hold:

- ≥ 3 notes share a recognizable body skeleton, spanning ≥ 2 weeks
- The pattern passes the **4-question test** in CLAUDE.md (state
  machine / identity / structured queries / required body shape).
  If none of the four hold, it stays a `note`.

If met, propose a `[change]` task. Specifics:

- `## Hypothesis` — "a dedicated `experiment` kind lets
  `artifact list --kind experiment` become useful and enforces
  sections the notes already carry informally"
- `## Before` — the N existing notes matching the shape, listed as
  **evidence**, not migration candidates
- `## Sweep plan` — **None.** `kind` determines id prefix and
  storage path; retroactive change would invalidate
  `references.jsonl` and scramble `audit.jsonl` history. The new
  kind applies only to artifacts written **after**
  `kinds/<name>.md` lands. Past notes stay notes.
    1. Write `kinds/<name>.md` (schema + status machine + required
       sections)
    2. `loopany doctor` — new kind parses, old notes still validate

### Surface both together

One monthly digest:

```
Goal drift:  <see Step 3>
Structural:  domain `xyz` candidate (7 artifacts, 3wk) — propose enable+sweep?
             kind `experiment` candidate (4 notes, 2wk, passes 4Q) — propose?
```

One drift → one `[change]` task. None → say so and stop; the user
wants to know you looked.

## Anti-patterns

### ❌ Running this weekly

One week is noise; false drift alerts follow.

### ❌ Auto-superseding a goal, or auto-filing a structural task

Drift is a hypothesis about intent, not a fact. Surface evidence
and wait for approval — both goal status flips and structural
tasks need a human on the trigger.

### ❌ Counting `[backfill]` tasks equally

Seeded during onboarding; doesn't reflect current intent. Weight
down or exclude from the denominator.

### ❌ Ignoring domain scope in alignment

If the goal has a domain, compute alignment within that domain
only. Tasks in unrelated domains aren't expected to mention it.

### ❌ Proposing a new `kind` on first sighting

One note with a distinctive shape is a note. Three with the same
skeleton is still *interesting, not a kind.* Run the 4-question
test; if none hold, it stays a `note`. Kinds ship a schema the
runtime enforces forever.

### ❌ Enabling a domain without committing to the sweep

If you enable `xyz` but leave existing `domain: xyz` artifacts
untouched (or never rename near-misses), the `[change]` task
hasn't cleared anything. Commit to the sweep or don't file.

## Quick reference

```
QUERY:     active goals + last-30d tasks
COMPUTE:   alignment ratio per goal (within domain scope if any)
SURFACE:   <30% drift · 30-60% check · ≥60% healthy
ACT:       backfill mentions OR re-run onboarding (supersedes)

STRUCTURE: ≥5 artifacts on unenabled domain, ≥2wk
             → propose [change] task: enable + real sweep
           ≥3 notes sharing body shape, ≥2wk, passes 4Q test
             → propose [change] task: add kind, forward-only (no migration)
```
