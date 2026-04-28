---
name: loopany-resolver
description: "Read FIRST in any loopany workspace. Routes user intent to the correct skill, enforces bootstrap, and orchestrates cross-skill chaining. Triggers: any loopany interaction, session start, ambiguous request, 'what should I do', multi-skill workflow."
---

# loopany-resolver — skill dispatcher

Read this before acting in a loopany workspace. It decides which skill to
load. Two skills match → read both; they chain.

## Bootstrap

```bash
loopany artifact list --kind mission --status active
```

No active mission → run onboarding (`ONBOARDING.md`). **Stop here** — nothing
else fires without a mission.

## Routing table

Match the trigger, read the target skill, then act.

| Trigger | Skill | Read |
|---------|-------|------|
| Any artifact CRUD (create/get/list/append/status/set) | core | `../loopany-core/SKILL.md` |
| Substantive work just ended (PR shipped, incident resolved, decision made) | capture | `../loopany-capture/SKILL.md` |
| "reflect" / "what have we learned" / ≥3 tasks done / writing learning or skill-proposal | reflect | `../loopany-reflect/SKILL.md` |
| "accept spr-…" / "reject spr-…" / review proposals | reflect | `../loopany-reflect/SKILL.md` |
| "what's due today" / daily check-in / session start | review (daily) | `../loopany-review/SKILL.md` |
| "what's slipping" / "weekly check" / "is the workspace healthy" | review (weekly) | `../loopany-review/SKILL.md` |
| "is this still the right mission?" / "anything structural?" / monthly | review (monthly) | `../loopany-review/SKILL.md` |
| Choosing a relation verb / `loopany refs add` | core conventions | `../loopany-core/conventions/relations.md` |
| Deciding note vs kind vs domain | core conventions | `../loopany-core/conventions/taxonomy.md` |

## Cross-skill chaining

Some workflows span multiple skills in sequence:

1. **Capture → Core**: capture decides the kind, core's kind playbook governs creation.
2. **Capture → Reflect**: after ≥3 captures in a session, suggest reflect.
3. **Reflect → Core**: reflect writes learnings/proposals via core's kind playbooks.
4. **Review → Core**: review dispatches each surfaced item to its kind playbook.
5. **Review → Reflect**: weekly review with ≥3 resolutions → suggest reflect.

## Disambiguation

- **Most specific wins.** "create a task" → core, not capture.
- **Conventions always stack.** Core doesn't exempt you from relations when calling `refs add`.
- **When in doubt, ask** before committing an artifact.

## Anti-patterns

- ❌ Acting without checking this routing table first.
- ❌ Skipping a skill's anti-patterns section — failure modes live there.
- ❌ Trusting memory over re-read — skills get edited via proposals.
- ❌ Writing an artifact without reading the kind playbook.
