---
kind: note
idPrefix: nte-
bodyMode: append
storage: flat
idStrategy: slug
dirName: notes
indexedFields: [tags]
---

# note

A free-form document. The fallback for "I want to write something down" —
project overviews, video summaries, research notes, reading takeaways, any
markdown that would otherwise scatter across an Obsidian vault.

**Reach for `note` first.** Only invent a new kind when at least one of
these holds:

1. **State machine** — the artifact moves through enforced states
   (`task`, `mission`, `learning`, `skill-proposal`)
2. **Identity / dedup** — many references must resolve to one canonical
   entity (`person`; future: `company`, `video` if you query by channel)
3. **Structured queries** — you'll filter or aggregate by typed fields
   (priority, status, due date)
4. **Required body shape** — a downstream program depends on fixed
   sections (e.g. `reflect` reads `## Outcome` from tasks)

If none of the above hold, it's a `note`. ID is a human-supplied slug
(`nte-project-phoenix`, `nte-karpathy-llm-talk`) so the file is
addressable without a timestamp prefix.

## Frontmatter

```yaml
title:    { type: string, required: true }
domain:   { type: string, required: false }
tags:     { type: 'string[]', required: false }
mentions: { type: 'string[]', required: false }
```

## Status machine

(none — note has no states)

## UI

cardFields: [title, tags]
