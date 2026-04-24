---
name: loopany-goal-check
description: Monthly check on whether the active `goal` still describes what the user is actually doing. Reads recent task artifacts to detect goal-drift. Use on monthly cadence or when the user asks "is this still the right goal?"
---

# goal-check — monthly goal-drift detection

Goals decay silently. A user locks in "grow MRR" one quarter and by
the next is mostly recruiting — but the active `goal` still says MRR,
and no one noticed. This skill is the noticing.

`ONBOARDING.md` lists goal-drift as a trigger for re-running
onboarding; this is the skill that detects it.

## When to run this

- Scheduled: once per month (agent platforms)
- On demand: user asks "is this still the right goal," "should we
  reset," "am I still working on the right thing"

**Never weekly.** One week of task data is too small to tell drift
from noise. One month is the minimum meaningful window.

## Step 1 — Pull the goal and recent tasks

```bash
# Active goals
loopany artifact list --kind goal --status active

# Tasks from the last 30 days (any status)
loopany artifact list --kind task
```

Filter tasks by ID prefix to the last 30 days (`tsk-YYYYMMDD-...`
sorts trivially).

## Step 2 — Compute alignment

For each active goal:

```
alignment = tasks mentioning this goal / total recent tasks
             (restricted to the goal's domain, if it has one)
```

Rough thresholds:

- **≥ 60%** — healthy. The goal reflects daily work. No action.
- **30–60%** — partial drift. The user splits time with untagged
  work. Ask: are the stray tasks actually serving the goal (missing
  `--mentions` backfill), or is there a second goal worth locking in?
- **< 30%** — clear drift. The user's actual work no longer serves
  this goal. Propose re-running onboarding.

Weight toward recent originals. A `[backfill]` task seeded during
onboarding says nothing about current intent and shouldn't count the
same as a live `[change]` task.

## Step 3 — Surface to the user

All goals healthy → one-line note, done.

Drift detected → present concretely, with evidence:

```
Drift on `gol-mrr-growth` (active since 2026-01):
- 23 tasks in the last 30 days, 6 mention this goal (26%)
- The other 17: mostly hiring + infra work

Two options:
1. Hiring/infra actually serves MRR — let me backfill the mentions
2. MRR isn't the main thing anymore — re-run onboarding and set a
   new goal (supersedes the old one)
```

Wait for the user to pick.

## Step 4 — Act

- **(1) Backfill** → batch-update `--mentions` on the affected tasks.
- **(2) Re-run onboarding** → flip the old goal to `superseded`,
  create the new one, add the `supersedes` reference. See
  `ONBOARDING.md` § "When to re-run onboarding" for the exact steps.
- **User wants neither** → push this skill's `check_at` 2–4 weeks
  with a reason. "Drift might be temporary, revisit after launch"
  is a reason. "Dunno yet" isn't.

## Anti-patterns

### ❌ Running this weekly

False drift alerts. One week is noise.

### ❌ Auto-superseding

Drift is a hypothesis about intent, not a fact. Confirm before
flipping any goal's status.

### ❌ Counting backfills equally

`[backfill]` tasks were seeded at onboarding and don't reflect
current work. Weight them down or exclude from the denominator.

### ❌ Ignoring domain scope

If the goal has a domain, compute alignment within that domain only.
Tasks in unrelated domains aren't expected to mention it, so
including them inflates the "drift" signal.

## Quick reference

```
QUERY:    active goals + last-30d tasks
COMPUTE:  alignment ratio per goal (within domain scope if any)
SURFACE:  <30% drift · 30-60% check · ≥60% healthy
ACT:      backfill mentions OR re-run onboarding (supersedes)
```
