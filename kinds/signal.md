---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status]
---

# signal

A lightweight "I noticed something" — an inbound signal the agent might act
on. Three states: `open` (default), `addressed` (some artifact has taken
responsibility for it), and `dismissed` (closed without action — false
positive, duplicate, or condition gone). The two terminal states encode
**why** a signal is closed: `addressed` requires an `addresses` edge from
the responsible artifact pointing back at this one; `dismissed` is the
catch-all for everything else.

Both terminal states allow `→ open` re-opening: a signal that recurs after
being addressed, or one a user un-hides via Restore, flips back to `open`
without rewriting history (the `addresses` edge stays as a historical
record).

## Frontmatter

```yaml
title:     { type: string, required: true }
domain:    { type: string, required: false }
url:       { type: string, required: false }
status:    { type: enum, values: [open, addressed, dismissed], default: open }
mentions:  { type: 'string[]', required: false }
```

## Status machine

```yaml
initial: open
transitions:
  open:      [addressed, dismissed]
  addressed: [open]
  dismissed: [open]
```

Transitioning to `addressed` requires the caller to supply a target
artifact id; the store writes a `<target> addresses <signal>` edge in the
same call. See `loopany artifact status --addressed-by <id>`.

## UI

cardFields: [title]
