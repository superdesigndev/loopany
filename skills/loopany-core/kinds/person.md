---
kind: person
dirName: people
indexedFields: [aliases]
---

# person

A human entity. Lives in `artifacts/people/<id>.md`. ID is the slug
itself (`--slug alice-chen` → `alice-chen`).

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

---

## Playbook

- Create when a human appears in ≥ 2 artifacts and needs a canonical reference.
- Before creating, check aliases: `loopany artifact list --kind person --contains "<name>"`.
- Body is append-only timeline with dated entries.
