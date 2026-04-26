---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status, priority, check_at]
---

# task

A unit of work the agent (or human) is doing. Carries its own outcome record:
when status flips to `done` or `failed`, the body must contain a
`## Outcome` section explaining what happened. This is the substrate the
self-improvement loop reads from.

## Frontmatter

```yaml
title:         { type: string, required: true }
domain:        { type: string, required: false }
status:        { type: enum, values: [todo, running, in_review, done, failed, cancelled] }
priority:      { type: enum, values: [low, medium, high, critical], default: medium }
check_at:      { type: date, required: false }   # `loopany followups` reads this
mentions:      { type: 'string[]', required: false }
```

## Status machine

```yaml
initial: todo
transitions:
  todo:      [running, done, cancelled]
  running:   [in_review, done, failed, cancelled]
  in_review: [done, failed, cancelled]
```

## Required sections

On `status: done` or `status: failed` → body must contain `## Outcome`.

## UI

cardFields: [title, status, priority]
