---
kind: journal
dirName: journal
slugLayout: year
indexedFields: [date]
---

# journal

A daily journal entry. **Auto-managed** — the artifact store creates the
day's entry lazily when the first non-journal artifact is created on
that day, and appends a wiki-link to the `## Activity` section every
time another artifact is born. IDs are local-date strings (`YYYY-MM-DD`).

Files live at `artifacts/journal/<YYYY>/<YYYY-MM-DD>.md` (the year
subdirectory is purely for human `ls` browsability — programmatically
the journal is one logical kind).

## Frontmatter

```yaml
date: { type: date, required: true }
```

`date` is the slug (`YYYY-MM-DD`). It's stored as frontmatter so the
file is self-describing without parsing the filename.

## Status machine

(none — journal entries are immutable indices, no states)

## Write policy

`loopany artifact create --kind journal` is **rejected** at the CLI
layer. The store's auto-append is the only writer. To write daily
narrative for the user, create a `brief` artifact instead — it
auto-links into the journal like every other kind.

Direct file edits (in Obsidian / your editor) coexist safely: the
auto-append only ever touches the `## Activity` section. Anything you
put outside that section is preserved untouched.

## Querying

The day's activity is recoverable two ways:

1. **Read the file** — `journal/<YYYY>/<YYYY-MM-DD>.md` and scan the
   Activity list. The wiki-links are the durable anchors.
2. **Query the graph** — `loopany refs <YYYY-MM-DD> --direction out`
   returns the same set, since wiki-links emit `mentions` edges.

## Backfill

Migrated artifacts (carrying `_backfilled: true` in frontmatter) land in
a separate `## Backfilled` section instead of `## Activity` — their
original creation moment is approximated, not authoritative.

---

## Playbook

- **Don't create journals manually.** Let the store do it.
- **Don't move journal entries** between dates — the date IS the id.
- For a daily summary the user reads, write a `brief` titled
  "YYYY-MM-DD daily" and let it auto-link into the journal.
