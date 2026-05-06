---
name: migrate-v0.1.0-to-v0.2.0
description: Migrate a loopany workspace from v0.1.0 to v0.2.0. Strips kind ID prefixes (tsk-/sig-/lrn-/...), flattens date-bucketed storage to artifacts/<dirName>/, renames snake_case frontmatter to camelCase, auto-stamps createdAt/updatedAt, builds the journal index, and adds the journal kind. Triggers when bootstrap throws SchemaVersionMismatchError pointing at this skill.
---

# v0.1.0 → v0.2.0

The first big simplification. Borrowed from crewlet's loopany rewrite —
fewer knobs, slugs as IDs, journal as the time spine.

## What changed

- **Kind frontmatter shrinks**: drop `idPrefix`, `bodyMode`, `storage`,
  `idStrategy`. Add optional `slugLayout: 'flat' | 'year'` (default
  `flat`).
- **Slugs are IDs**: no kind prefix. `tsk-20260427-103045` → `20260427-103045`,
  `prs-self` → `self`. Globally unique across kinds (collision is a fail).
  Unicode allowed (CJK fine).
- **Storage flattens**: every artifact lives at
  `artifacts/<dirName>/<id>.md`. The old `artifacts/{YYYY-MM}/...` time
  bucket is gone — time becomes a `journal` artifact.
- **Frontmatter goes camelCase**: `check_at` → `checkAt`,
  `for_date` → `forDate`, `target_skill` → `targetSkill`.
- **Auto `createdAt` / `updatedAt`**: every write stamps these. Migration
  derives `createdAt` from old timestamp IDs (or file mtime for slug IDs).
- **`journal` kind**: new auto-managed kind. One entry per day at
  `artifacts/journal/<YYYY>/<YYYY-MM-DD>.md`. Migration backfills it
  from every existing artifact's `createdAt`.

Crewlet-specific extensions (`lead`, `content-piece`, signal UI fields
like `priority`/`actionableBy`/`impact`/`quickWin`, task runtime fields
like `executor`/`prUrl`/`branchName`) are deliberately **not** brought
over — they're crewlet's domain, not loopany's core.

## Why

The v0.1 model carried 4 nobs (`idPrefix`/`storage`/`idStrategy`/`bodyMode`)
that nobody ever set differently. They added cognitive load to every kind
file without expressing real choice. The `journal` design folds the time
hierarchy into the same graph everything else uses — `refs({id:'2026-05-06',
direction:'out'})` is now "what happened that day" without any new query
machinery.

See the upstream design at
`/Users/stonex/Workspace/primecrew/apps/crewlet/src/loopany/skills/core-artifacts/`.

## Pre-flight

```bash
# 1. Snapshot the workspace (recoverable rollback path)
cd $LOOPANY_HOME
git init -q 2>/dev/null || true
git add -A && git commit -q -m "pre-migration snapshot v0.1.0" || true

# 2. Capture the current state
loopany doctor > /tmp/loopany-pre-migration-doctor.txt 2>&1 || true
ls artifacts/ > /tmp/loopany-pre-migration-tree.txt
```

If doctor reports any `fail` checks already, **fix those first** — the
migration assumes a healthy v0.1 workspace.

## Steps

Run each script first without `--apply` (dry-run) and inspect the output.
When it looks right, rerun with `--apply`. Scripts are idempotent —
rerunning does no harm.

```bash
SKILL=skills/migrations/v0.1.0-to-v0.2.0/scripts

# 1. Snapshot — counts artifacts, validates IDs, flags collisions.
bun run $SKILL/01-snapshot.ts

# 2. Transform every artifact: rewrite frontmatter (snake → camel,
#    add createdAt/updatedAt/_backfilled), rename file, flatten dirs,
#    rewrite [[old-id]] wiki-links inside body.
#    Writes .migration-id-map.json to the workspace root.
bun run $SKILL/02-transform-artifacts.ts            # dry-run
bun run $SKILL/02-transform-artifacts.ts --apply

# 3. Rebuild references.jsonl with new IDs.
#    Uses .migration-id-map.json from step 2.
bun run $SKILL/03-rebuild-references.ts             # dry-run
bun run $SKILL/03-rebuild-references.ts --apply

# 4. Build journal entries — one file per date with backfilled artifacts
#    in `## Backfilled`.
bun run $SKILL/04-build-journal.ts                  # dry-run
bun run $SKILL/04-build-journal.ts --apply

# 5. Bump schemaVersion in config.yaml.
bun run $SKILL/05-bump-version.ts --apply

# 6. Refresh kinds/*.md from the bundled v0.2 definitions
#    (loopany init never overwrites — this step does).
bun run $SKILL/06-refresh-kinds.ts                  # dry-run
bun run $SKILL/06-refresh-kinds.ts --apply
```

After step 6, `loopany doctor` should pass cleanly with `schema version: ok`.

## Rollback

```bash
cd $LOOPANY_HOME
git reset --hard HEAD                # back to pre-flight snapshot
rm -f .migration-id-map.json         # discard the in-progress map
```

If you've gone past `git commit` mid-migration, the snapshot still wins —
all migration mutations are within the workspace tree.

## Verification

```bash
loopany doctor                       # should be all green
loopany artifact list --kind task    # IDs no longer have `tsk-` prefix
loopany artifact list --kind journal # one entry per active date
ls $LOOPANY_HOME/artifacts/          # no {YYYY-MM}/ buckets, only kind dirs
```

Any `loopany doctor` failure should reproduce the exact symptom — file an
issue with the doctor output and the contents of `.migration-id-map.json`.

## Notes

- **ID collisions**: if two old artifacts strip down to the same slug
  (e.g. `mis-self` and `prs-self` both → `self`), step 02 fails loud.
  Resolve by renaming one of the source files before running, e.g.
  `mv artifacts/missions/mis-self.md artifacts/missions/mis-self-mission.md`.
- **`addresses` edges**: stored in `references.jsonl`, rewritten in step 03.
  No data is lost.
- **`_backfilled: true`**: every migrated artifact gets this flag — it's
  honest about provenance and routes the artifact to the journal's
  `## Backfilled` section instead of `## Activity`.
- **Scripts never import from `src/core/`**: they parse the old format
  directly so they remain runnable even when the binary no longer
  understands v0.1 files.
