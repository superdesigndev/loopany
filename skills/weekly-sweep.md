---
name: loopany-weekly-sweep
description: Use on weekly cadence or when the user says "what's slipping" / "weekly check" / "is the workspace healthy". Three problems it sweeps: drift (`loopany doctor`), slippage (overdue `check_at`), parking lots (running tasks ≥14d, active signals ≥7d, pending proposals). Forces closure on stuck artifacts. Distinct from the daily [[./daily-followups.md]].
---

# weekly-sweep — drift + stuck-artifact sweep

Three problems loopany workspaces develop silently:

1. **Drift** — artifacts reference a domain that isn't enabled, kinds
   fail validation, references point nowhere. `loopany doctor` catches
   these.
2. **Slippage** — items whose `check_at` slid past today, never
   addressed. Daily [[./daily-followups.md]] stays focused on today; this is
   where last week's misses come back into view.
3. **Parking lots** — artifacts sitting in non-terminal status with no
   `check_at` and no recent activity. Running tasks, active signals,
   pending skill-proposals. They don't slip (no date to slip past) but
   they don't move either — and the daily digest can't see them.

Run once per week. Never daily — nothing stagnates in 24 hours.

## When to run this

- Scheduled: once per week (agent platforms)
- On demand: user asks "what's slipping," "is the workspace healthy,"
  "weekly check"

## Step 1 — Workspace drift (`doctor`)

```bash
loopany doctor --format json
```

Exit 0 + empty findings → workspace is clean. Say so briefly — the
user wants to know you looked.

Findings present → summarize **categories**, not every item:

```
Workspace drift (3 findings):
- 2 artifacts use domain `fundraising` which isn't enabled
- 1 learning references a missing evidence artifact
```

For each category, propose a fix:

- unknown domain → enable it, or rewrite the artifact's domain
- dangling reference → remove the edge, or mark the referring artifact
- validation failure → re-read the kind and correct frontmatter

**Don't auto-fix without the user saying yes.** Drift is often the
fingerprint of a decision the user is mid-way through — a new domain
they haven't committed to, a rename that's half-done. Silent cleanup
erases that signal.

## Step 2 — Overdue followups

```bash
loopany followups --due overdue
```

Everything whose `check_at` is past today. Classify each:

**A. Still relevant — user forgot.** Re-surface with a gentler framing
than the original.

**B. Outdated — question no longer applies.** Retire via the right
kind's terminal state: `task cancelled --reason`, `learning
superseded`, etc. Use [[./conventions/core-artifacts.md]] for tasks.

**C. Shouldn't have had a `check_at`.** Remove the date with a brief
note. Repeated mis-scheduling is fodder for [[./reflect.md]].

**D. Zombie — keeps coming back.** Pushed ≥2 times with no progress,
or in overdue ≥2 consecutive sweeps. The user has seen it and chosen
not to act. **Forced choice**: commit to a specific next step with a
near-term `check_at`, or retire it entirely. No third drift.

## Step 3 — Parking-lot sweeps

Three queries, same discipline: anything in non-terminal status
without recent activity gets forced to a closed state.

### 3a. Running tasks that stalled

```bash
loopany artifact list --kind task --status running
```

For any task running ≥14 days with no recent append:

- **Still actively blocked** → flip to `in_review` if waiting on
  external work, or set a near-term `check_at` with a concrete
  unblock condition
- **Abandoned** → `failed` or `cancelled` with Outcome per
  [[./conventions/core-artifacts.md]]

Don't accept "still working on it" as closure — that's how `running`
turns into a parking lot.

### 3b. Active signals nobody acted on

```bash
loopany artifact list --kind signal --status active
```

For any signal active ≥7 days without upgrade or dismissal:

- **Real, going to act** → upgrade to task via [[./conventions/core-artifacts.md]] § Signal → Task promotion
- **Real, not acting** → dismiss with reason (so [[./reflect.md]] can
  see it if it recurs)
- **Wasn't really a signal** → delete

An unresolved observation compounds as noise. Force a decision.

### 3c. Pending skill-proposals

```bash
loopany artifact list --kind skill-proposal --status pending
```

- Count > 0 → mention in the weekly report; these are waiting on
  the user.
- Count > 5 → the self-improvement loop is blocked on triage. Nudge
  the user to sit with [[./proposal-review.md]] before another
  [[./reflect.md]] run adds more.

## Step 4 — Report and close

Short digest, four sections:

```
Doctor: clean (or: 3 findings — see fixes above)
Slipped: 2 tasks past due, 1 learning 10 days overdue
Parking lot: 1 task running 21d, 3 active signals ≥1wk, 4 pending proposals
```

Per-item prompts for anything ambiguous. **Same closure gate as
[[./daily-followups.md]]**: every surfaced item ends this session in
`resolved / re-scheduled / retired`. Zombies are the failure mode
this skill exists to prevent; don't become the source of new ones.

## Step 5 — Feed reflect

If this pass resolved ≥3 items (any mix of done / cancelled /
superseded / dismissed), that's a batch worth reflecting on. Either
nudge the user with "want to run a reflection?" or, on agent
platforms, make sure [[./reflect.md]] is on this week's cron.

## Anti-patterns

### ❌ Running this daily

One week of overdue is a useful pattern. One day's worth is "the
session didn't happen yet." A daily weekly-sweep becomes a second
daily-followups digest and trains the user to ignore both.

### ❌ Treating doctor output as user-facing

JSON is for you. Categories + proposed fixes are for the user.

### ❌ Silently fixing drift

`enable the domain`, `remove the edge` — user decisions. Propose,
don't act.

### ❌ Accepting "still working on it" for running tasks

If it's really active, it earns a fresh `check_at` with an unblock
condition. If it can't earn that, it's abandoned.

### ❌ Rescheduling without a reason

Every `check_at` push needs a reason — same rule as
[[./daily-followups.md]].

## Quick reference

```
DOCTOR:   loopany doctor → categorize → propose fixes
OVERDUE:  followups --due overdue → A forgot · B outdated · C mis-set · D zombie
PARKING:  running ≥14d · active signals ≥7d · pending proposals >0
CLOSE:    every surfaced item ends resolved / re-scheduled / retired
FEED:     ≥3 resolutions → nudge reflect
```
