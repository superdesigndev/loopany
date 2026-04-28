---
name: loopany-core
description: "Artifact lifecycle for loopany — the agent brain. Use when creating, modifying, or querying any artifact (task, signal, learning, skill-proposal, mission, person, note, brief). Read this SKILL.md first for routing, then the relevant kind's Playbook. Triggers: any artifact CRUD, 'create a task', 'write a signal', 'dismiss signal', 'flip to done', 'what kind should this be', choosing a relation verb."
---

# loopany-core — artifact operations

Read this first when working in a loopany workspace. Routes you to the
right kind playbook for any artifact operation.

## Bootstrap

```bash
loopany artifact list --kind mission --status active
```

No active mission → run onboarding first (see `ONBOARDING.md`).

## Kind routing

Each kind file has schema (Frontmatter, Status machine) AND operational
guide (§ Playbook). Read the kind file before creating or modifying.

| Trigger | Read |
|---------|------|
| Committing to work, `[change]` / `[incident]` | `kinds/task.md` |
| Writing Outcome, flipping task status | `kinds/task.md § Playbook` |
| Noticed something, can't act now | `kinds/signal.md` |
| Dismissing / upgrading a signal | `kinds/signal.md § Playbook` |
| Writing a learning | `kinds/learning.md` |
| Writing a skill-proposal | `kinds/skill-proposal.md` |
| Creating / updating a mission | `kinds/mission.md` |
| Writing a brief | `kinds/brief.md` |
| Recording a person entity | `kinds/person.md` |
| Anything else | `kinds/note.md` |

## Decision rule

| State | Artifact |
|---|---|
| Acting now / committed | `task` |
| Deferred / unverified | `signal` |
| Pattern-backed belief | `learning` (via `loopany-reflect`) |
| Belief implies skill edit | `skill-proposal` (via `loopany-reflect`) |
| Long-running pursuit | `mission` |
| Point-in-time summary | `brief` |
| Human entity | `person` |
| Nothing unresolved | nothing, or `note` if rationale matters |
| Duplicate | append evidence; don't fork |

## Conventions

- **Relations** (`conventions/relations.md`) — 6 canonical verbs for `refs add`.
- **Taxonomy** (`conventions/taxonomy.md`) — note vs kind vs domain decision tree.

## Related skills

| Need | Skill |
|------|-------|
| Self-improvement (reflect → learning → proposal) | `loopany-reflect` |
| Periodic reviews (daily / weekly / monthly) | `loopany-review` |
| Auto-capture after work concludes | `loopany-capture` |

## Anti-patterns

- ❌ Acting without reading the kind playbook.
- ❌ Skipping anti-patterns sections — failure modes live there.
- ❌ Creating an artifact without checking this routing table first.
