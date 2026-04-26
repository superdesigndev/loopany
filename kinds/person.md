---
kind: person
idPrefix: prs-
bodyMode: append
storage: flat
idStrategy: slug
dirName: people
indexedFields: [aliases]
---

# person

A human entity. Lives outside the time-bucketed artifact pool, in
`loopany/artifacts/people/`. ID is `prs-` + slug (`--slug alice-chen`
→ `prs-alice-chen`, never `--slug prs-alice-chen`).

Frontmatter is the "current understanding" — name and aliases can change
over time. Body is append-only timeline of mentions and updates.

## Frontmatter

```yaml
name:     { type: string, required: true }
domain:   { type: string, required: false }
aliases:  { type: 'string[]', required: false }   # 'alice' / 'a. chen' / 'A.C.'
emails:   { type: 'string[]', required: false }
handles:  { type: 'string[]', required: false }   # @twitter / linkedin slug / etc.
mentions: { type: 'string[]', required: false }
```

## Status machine

(none — entity kind, no states)

## UI

cardFields: [name, aliases]
