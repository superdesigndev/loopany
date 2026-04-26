---
name: loopany-resolver
description: Read FIRST when working in a loopany workspace. Maps user intent to the correct loopany skill file. All other loopany skills are dispatched through this.
---

# loopany skill resolver

Match the trigger, **Read** the target skill, then act. Two skills match → read both; they chain.

## Conventions (read once, keep in context)

Apply on top of every other skill:

| Skill | When |
|---|---|
| [[relations/SKILL.md]] | Any `loopany refs add`, or picking a relation verb |
| [[new-concept/SKILL.md]] | Choosing `note` / new kind / new domain |
| [[core-artifacts/SKILL.md]] | Any `signal` or `task` lifecycle action — find the right § inside |

## Bootstrap

Fresh workspace (no `mission` with `status: active`) **or** user says "redo onboarding" / "reset the mission" → [[ONBOARDING.md]]. The one flow that doesn't dispatch through here.

## On-demand triggers

| Trigger | Read |
|---|---|
| Substantive work just ended (PR shipped, incident resolved, decision made, signal/outcome observed) | [[proactive-capture/SKILL.md]] |
| Subagent dispatched with "record this via loopany" | [[proactive-capture/SKILL.md]], then the form skill it names |
| Anything in the `signal` / `task` lifecycle | [[core-artifacts/SKILL.md]] |
| "reflect" / "what have we learned" / ≥3 tasks done with similar Outcomes / writing a `learning` or `skill-proposal` | [[reflect/SKILL.md]] |
| "is this still the right mission?" / "anything structural worth locking in?" / monthly review | [[monthly-review/SKILL.md]] |
| "what's due today" / "what am I forgetting" / daily check-in | [[daily-followups/SKILL.md]] |
| "what's slipping" / "weekly check" / "is the workspace healthy" | [[weekly-sweep/SKILL.md]] |

## Disambiguation

- **Most specific wins.** `core-artifacts` over a vague "creating things".
- **Conventions stack.** `core-artifacts` doesn't exempt you from `relations` when you call `refs add`.
- **When in doubt, ask** before committing an artifact. A bad artifact is worse than a clarifying question.

## Anti-patterns

- **Writing an artifact without checking if a skill applies** — one markdown read is far cheaper than a malformed artifact in the record forever.
- **Skipping a skill's anti-patterns section** — that's where the failure modes live.
- **Trusting memory over Re-Read** — skills get edited; the gist you remember may be stale.

## Not yet covered

No skill exists for these — use judgment, flag as candidate for a new skill / `kind propose`:

- Per-item handling of `loopany followups --due today`
- Whether a named entity becomes a `person` or stays a mention
- Writing a `brief` (daily / weekly summary)
