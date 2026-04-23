---
kind: goal
idPrefix: gol-
bodyMode: append
storage: flat
idStrategy: slug
dirName: goals
indexedFields: [status]
---

# goal

What this brain is *for*. A goal artifact represents an organizing intention
the agent is helping the user pursue: "raise a seed round," "hire two
engineers in Q2," "ship the rebuild by end of June." Multiple goals can be
`active` simultaneously (a founder is rarely doing one thing) but during
onboarding the agent locks in **one** to avoid scope creep.

Goal shifts go through `status: superseded` rather than rewriting history —
the old goal stays cited so we can look back at why it changed.

## Frontmatter

```yaml
title:  { type: string, required: true }
status: { type: enum, values: [active, superseded, archived] }
```

## Status machine

```yaml
initial: active
transitions:
  active:     [superseded, archived]
  superseded: [archived]
```

## Body conventions (not enforced, write them anyway)

```
## Why this goal
   <one paragraph: what success looks like, what failure modes to avoid>

## How loopany serves this goal
   <bullets: what kinds of artifacts this goal generates>

## Day 1 — YYYY-MM-DD
   <one line: who set the goal, in what context>

## Update YYYY-MM-DD            ← append over time as the goal evolves
   <what changed in the user's situation>
```

## UI

cardFields: [title, status]
