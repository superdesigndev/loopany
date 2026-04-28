---
kind: mission
idPrefix: mis-
bodyMode: append
storage: flat
idStrategy: slug
dirName: missions
indexedFields: [status, hypothesis]
---

# mission

What this brain is *for* — a long-running pursuit the agent advances over
weeks or months through a hypothesis → action → evaluate → update loop.
"Raise a seed round," "ship the rebuild by end of June," "improve ROAS
to 3.0x." Multiple missions can be `active` at once; during onboarding
the agent locks in **one** to avoid scope creep.

A mission is the agent's standing intention plus its current best read
of how to advance — not a one-shot task. Tasks address it; learnings
inform it; briefs report on it. The mission itself accumulates progress
in its body (append-only).

Mission shifts go through `status: abandoned` (with a reason) plus a
`supersedes` relation to the new mission — the old one stays cited so
we can look back at why it changed.

## Frontmatter

```yaml
title:      { type: string, required: true }
hypothesis: { type: string, required: false }
domain:     { type: string, required: false }
status:     { type: enum, values: [active, paused, satisfied, abandoned] }
```

`hypothesis` is the current best read of how to achieve the mission. It
mirrors the body's `## Current hypothesis` section so it can be queried
without reading the body. Update it in lockstep with the body via
`artifact set`.

## Status machine

```yaml
initial: active
transitions:
  active: [paused, satisfied, abandoned]
  paused: [active, abandoned]
```

`satisfied` and `abandoned` are terminal. To revisit a closed mission,
create a new one and link with `supersedes`.

## Required sections

On `status: satisfied` or `status: abandoned` → body must contain
`## Outcome` (what was achieved, or why it was dropped — with evidence).

## On being `mentions`ed

A mission does not expect routine mentions. `mentions: <this-mission-id>`
is a claim that the artifact materially advances, tests, or provides
evidence for the mission — not that the artifact happens in the same
workstream (that's what `domain` is for).

If every artifact in the workspace mentions the mission, the edge has
lost signal. Default is not to mention.

## Body conventions (not enforced, write them anyway)

```
## Why this mission
   <one paragraph: what success looks like, what failure modes to avoid>

## Current hypothesis
   <the working theory of how to advance — kept in sync with frontmatter>

## How loopany serves this mission
   <bullets: what kinds of artifacts this mission generates>

## Day 1 — YYYY-MM-DD
   <one line: who set the mission, in what context>

## Progress YYYY-MM-DD            ← append over time as the mission advances
   <what changed, what was tried, what was learned>

## Outcome (terminal status only)
   <what was achieved, or why it was dropped, with evidence>
```

## UI

cardFields: [title, status, hypothesis]

---

## Playbook

### When to create

- **Onboarding** — first-run setup locks in one active mission.
- **Mission shift** — old → `abandoned` with reason + new mission with `supersedes` edge.

### Alignment monitoring

The `loopany-review` skill checks monthly:
```
alignment = tasks mentioning this mission / total recent tasks
```

| Alignment | Action |
|-----------|--------|
| ≥ 60% | Healthy |
| 30-60% | Partial drift — backfill mentions or lock in second mission? |
| < 30% | Clear drift — propose re-onboarding |

### Anti-patterns

- ❌ Auto-abandoning — drift is hypothesis, surface and wait for user.
- ❌ Ignoring domain scope — compute alignment within mission's domain.
