---
name: loopany-review
description: "Periodic review for loopany — daily, weekly, or monthly. Triggers: 'what's due today', 'what am I forgetting', 'what's slipping', 'weekly check', 'is the workspace healthy', 'is this still the right mission?', 'anything structural?', session start, daily/weekly/monthly cadence."
---

# loopany-review — parameterized periodic check

One skill, three frequencies. Each adds scope; all share the same closure gate.

## Frequency routing

| Freq | Scope | Trigger | Read |
|------|-------|---------|------|
| **daily** | `check_at = today` | "what's due today", session start | `references/daily.md` |
| **weekly** | overdue + parking lots + doctor | "what's slipping", "weekly check" | `references/weekly.md` |
| **monthly** | mission alignment + structural drift | "right mission?", "anything structural?" | `references/monthly.md` |

**Don't mix scopes.** One week of overdue is a pattern; one day isn't.

## Unified flow (all frequencies)

### 1. Query

Frequency-specific — see the reference file.

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

## Anti-patterns

- ❌ Daily runs overdue → weekly's job.
- ❌ Weekly runs daily → nothing stagnates in 24h.
- ❌ Monthly runs weekly → 1 week can't detect drift.
- ❌ Defer without reason → items rot.
- ❌ Surface without closing → worse than no digest.
- ❌ Manufacture content when empty → quiet is fine.
- ❌ Dump raw JSON → your job is judgment.

## Quick reference

```
DAILY:    followups --due today → classify → surface → dispatch → close
WEEKLY:   doctor + overdue + parking lots → classify → surface → close → feed reflect
MONTHLY:  mission alignment + structural drift → surface → user decides
GATE:     every surfaced item → resolved / deferred / retired
```
