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

---

## Playbook

### When to create

- **Committing to do something** → task. Not "I should look into
  this" (that's a `signal`).
- **Upgrading from signal** → see `kinds/signal.md § Playbook § Upgrading`.
- **Check for duplicates first**:
  ```bash
  loopany artifact list --kind task --contains "<key phrase>"
  ```
  Near-duplicate in `todo` or `running`? Append or link with `follows-up`.

### Body

`## Outcome` is required before `done` or `failed`. It should answer:

- What shipped, changed, or was decided?
- Is the issue fixed, or did the attempt fail?
- If there was an expected effect, did the observable evidence move?
- What would you do differently?

Optional sections when they help judge the Outcome:

- `## Before` — baseline evidence (strongly recommended for metric tasks).
- `## Plan` or `## Fix` — work notes.
- `## Follow-up` — loose threads not yet a next task or learning.

Failed or neutral results are useful evidence. Say so directly.

### Status guide

| Status | Meaning | Requirement |
|---|---|---|
| `todo` | Not started | — |
| `running` | Started | don't use as parking lot |
| `in_review` | PR open / waiting externally | use instead of long blocked `running` |
| `done` | Delivered | `## Outcome` required |
| `failed` | Attempted, didn't work | `## Outcome` required |
| `cancelled` | Decided not to do | reason required |

Don't convert failed work to `cancelled` to keep lists clean.

Terminal gate:
```bash
loopany artifact append <id> --section Outcome --content "..."
loopany artifact status <id> <done|failed> --reason "<one line>"
```

### `check_at`

Set only with a concrete future question. `loopany followups --due today`
reads it. Missing `check_at` > a date you'll ignore.

### From signal → task

When a signal becomes work, create a task. After the task closes:
```bash
loopany artifact status sig-... addressed --addressed-by tsk-...
```

### Follow-up scheduling

```bash
loopany artifact create --kind task --title "..." --status todo --check-at 2026-05-06
loopany refs add --from tsk-future --to tsk-today --relation follows-up
```

### Anti-patterns

- ❌ Same-day Outcomes for metrics that need time to settle.
- ❌ Outcome = "Shipped. It works." — not evidence.
- ❌ `running` as parking lot — blocked? `in_review`. Abandoned? `failed`/`cancelled`.
- ❌ Task as entity holder — tweets, posts, customers are entities (`note` or domain kind).
- ❌ One task → one learning — wait for a pattern.
