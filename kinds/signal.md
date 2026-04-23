---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [source, dismissed]
---

# signal

A lightweight "I noticed something" — an inbound signal the agent might act
on. No status machine; signals are either acted on (via a `led-to` reference
to a follow-up artifact) or dismissed.

## Frontmatter

```yaml
summary:   { type: string, required: true }
source:    { type: string, required: false }   # 'email' / 'chat' / 'manual' / etc.
url:       { type: string, required: false }
dismissed: { type: bool, default: false }
mentions:  { type: 'string[]', required: false }
```

## Status machine

(none — signal has no states)

## UI

cardFields: [summary, source]
