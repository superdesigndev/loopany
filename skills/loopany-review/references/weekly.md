# Weekly review

Query all three sources, then return to `../SKILL.md § Unified flow` step 2.

## Query

```bash
loopany followups --due overdue
loopany doctor --format json
```

Plus parking-lot queries below.

## Doctor

Summarize by category, propose fixes. **Don't auto-fix** — may be a decision
in progress.

## Parking lots

| Query | Threshold |
|-------|-----------|
| `artifact list --kind task --status running` | ≥ 14d, no recent append |
| `artifact list --kind signal --status open` | ≥ 7d, no action |
| `artifact list --kind skill-proposal --status pending` | any → mention; > 5 → nudge |

Stalled running → `in_review` or `failed`/`cancelled` with Outcome.
"Still working on it" is not closure.

## Feed reflect

≥ 3 resolutions this pass → suggest `loopany-reflect`.
