---
kind: brief
idPrefix: brf-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [for_date]
---

# brief

A point-in-time summary the agent (or cron) writes for the user. Examples:
morning briefing, weekly review, post-meeting recap. Once written, treated
as cited — never rewritten in place. If the same period needs a fresh
briefing, create a new one and `supersedes` the old.

Briefings are how the brain talks back to the user. A good briefing
references (`mentions`) the artifacts it cites so the user can drill in.

## Frontmatter

```yaml
title:    { type: string, required: true }       # e.g. "Morning briefing"
domain:   { type: string, required: false }
for_date: { type: date, required: false }        # the day/period this covers
mentions: { type: 'string[]', required: false }  # artifacts cited in the body
```

## Status machine

(none — briefings have no states)

## Body conventions (not enforced)

```
## What's due today
## What changed since last briefing
## Open threads
## Suggested next moves
```

## UI

cardFields: [title, for_date]
