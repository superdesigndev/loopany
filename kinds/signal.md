---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [source, status]
---

# signal

A lightweight "I noticed something" — an inbound signal the agent might act
on. Two states: `open` (default) and `dismissed`. Signals get acted on
(via a `led-to` reference to a follow-up artifact) or dismissed with a
reason.

## Frontmatter

```yaml
summary:   { type: string, required: true }
domain:    { type: string, required: false }
source:    { type: string, required: false }   # 'email' / 'chat' / 'manual' / etc.
url:       { type: string, required: false }
status:    { type: enum, values: [open, dismissed], default: open }
mentions:  { type: 'string[]', required: false }
```

## Status machine

```yaml
initial: open
transitions:
  open: [dismissed]
```

## UI

cardFields: [summary, source]
