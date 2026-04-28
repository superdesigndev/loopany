---
name: loopany-review
description: "Periodic review for loopany — daily, weekly, or monthly. Daily: surface today's due check_at items. Weekly: overdue + parking lots + workspace doctor. Monthly: mission alignment + structural drift. Triggers: 'what's due today', 'what am I forgetting', 'what's slipping', 'weekly check', 'is the workspace healthy', 'is this still the right mission?', 'anything structural?', session start, daily/weekly/monthly cadence."
---

# loopany-review — parameterized periodic check

One skill, three frequencies. Each adds scope; all share the same closure gate.

## Frequency

| Freq | Scope | Trigger |
|------|-------|---------|
| **daily** | `check_at = today` | "what's due today", session start |
| **weekly** | overdue + parking lots + doctor | "what's slipping", "weekly check" |
| **monthly** | mission alignment + structural drift | "right mission?", "anything structural?" |

**Don't mix scopes.** One week of overdue is a pattern; one day isn't.

## Unified flow

### 1. Query

| Freq | Command |
|------|---------|
| daily | `loopany followups --due today` |
| weekly | `loopany followups --due overdue` + parking-lot queries + `loopany doctor --format json` |
| monthly | `loopany artifact list --kind mission --status active` + recent tasks (30d) |

### 2. Classify

Read each: `loopany artifact get <id>`

- **A. Silently resolvable** — extend `check_at` with a one-line reason.
- **B. Needs the user** — requires judgment or data only user has.
- **C. Defer** — push `check_at` forward **with a reason**.

For learnings: `loopany trace <lrn-id> --direction backward`

### 3. Surface

Only bucket **B**. One line per item:

```
3 things need you today:
1. [tsk-…] 2-week recheck — did $/session settle?
2. [lrn-…] "short deals close 2.5x faster" — still true?
3. [sig-…] recurring churn signal, 3rd time. Upgrade?
```

Empty → say so and stop.

### 4. Dispatch

Route to kind playbooks in `loopany-core`:
- Task → `../loopany-core/kinds/task.md § Playbook`
- Learning → `../loopany-core/kinds/learning.md § Playbook`
- Signal → `../loopany-core/kinds/signal.md § Playbook`
- Mission → `../loopany-core/kinds/mission.md § Playbook`

### 5. Close (the gate)

Every surfaced item must end the session in one of:
- **Resolved** — state transition written.
- **Deferred** — `check_at` pushed with reason. "Not yet" isn't a reason.
- **Retired** — `check_at` removed with note.

**No zombie items.** A digest without state changes is noise.

---

## Daily

- Only today, not overdue (weekly's job).
- Max once per day. Empty → report and stop.

## Weekly

### Doctor

```bash
loopany doctor --format json
```

Summarize by category, propose fixes. **Don't auto-fix** — may be decision in progress.

### Parking lots

| Query | Threshold |
|-------|-----------|
| `artifact list --kind task --status running` | ≥ 14d, no recent append |
| `artifact list --kind signal --status open` | ≥ 7d, no action |
| `artifact list --kind skill-proposal --status pending` | any → mention; > 5 → nudge |

Stalled running → `in_review` or `failed`/`cancelled` with Outcome.
"Still working on it" is not closure.

### Feed reflect

≥ 3 resolutions this pass → suggest `loopany-reflect`.

## Monthly

### Mission alignment

→ `../loopany-core/kinds/mission.md § Playbook § Alignment monitoring`

### Structural drift — domains

All three must hold: ≥ 5 artifacts with unenabled domain, ≥ 2 weeks, distinguishable. → propose `[change]` task.

### Structural drift — kinds

Both must hold: ≥ 3 notes with shared body skeleton ≥ 2 weeks, passes 4-question test (`../loopany-core/conventions/taxonomy.md`). → propose `[change]` task (forward-only, no migration).

---

## Anti-patterns

- ❌ Daily runs overdue → weekly's job.
- ❌ Weekly runs daily → nothing stagnates in 24h.
- ❌ Monthly runs weekly → 1 week can't detect drift.
- ❌ Defer without reason → items rot.
- ❌ Surface without closing → worse than no digest.
- ❌ Manufacture content when empty → quiet is fine.
- ❌ Dump raw JSON → your job is judgment.
- ❌ Auto-fix doctor findings → may be in-progress decision.
- ❌ Auto-abandon mission → drift is hypothesis.

## Quick reference

```
DAILY:    followups --due today → classify → surface → dispatch → close
WEEKLY:   doctor + overdue + parking lots → classify → surface → close → feed reflect
MONTHLY:  mission alignment + structural drift → surface → user decides
GATE:     every surfaced item → resolved / deferred / retired
```
