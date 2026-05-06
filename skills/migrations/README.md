# loopany migrations

Schema migrations for loopany workspaces. One directory per version jump,
each shippable as a self-contained skill the agent can read and execute.

## Layout

```
skills/migrations/
  README.md                          # this file
  v<from>-to-v<to>/
    SKILL.md                          # change rationale + run plan + rollback
    scripts/
      01-<step>.ts                    # standalone bun-runnable
      02-<step>.ts
      ...
      99-bump-version.ts              # final step: write schemaVersion to config.yaml
```

Directory naming: `v<from>-to-v<to>/` where versions are full semver
(`v0.1.0-to-v0.2.0`, not `v0.1-to-v0.2`). The CLI parses this format.

## How it runs

`loopany migrate` is a discovery hook — it does not execute scripts. The
agent does:

1. `loopany migrate` — sees the next migration name.
2. `loopany migrate <name>` — reads SKILL.md and the script list.
3. Runs each script in order: `bun run skills/migrations/<name>/scripts/01-…ts`
   (default: dry-run; `--apply` to commit).
4. Reruns `loopany doctor` after the final script — version check should pass.

This separation matters: scripts are pure data transforms, the skill is the
narrative, and the CLI is just an index. Coupling them would make it
impossible to roll a workspace forward step-by-step or stop midway.

## Version check

`config.yaml#schemaVersion` is the workspace's claimed version.
`SCHEMA_VERSION` in `src/version.ts` is what the binary expects.

Mismatch → bootstrap throws `SchemaVersionMismatchError` and points at the
matching migration. `loopany doctor` and `loopany migrate` bypass the check
(via `bootstrap({ skipVersionCheck: true })`) so they remain usable on a
stale workspace. Migration scripts themselves bypass via env var
`LOOPANY_SKIP_VERSION_CHECK=1`.

A migration's final script must write the new version:

```ts
await config.setSchemaVersion('0.2.0');
```

## Authoring a new migration

When changing the workspace format:

1. **Decide the new version.** Bump SCHEMA_VERSION in `src/version.ts` and
   the `to` field of the new migration. Bump the **minor** for additive or
   transformable changes; **major** is reserved for breaks the migration
   can't bridge.
2. **Create `skills/migrations/v<from>-to-v<to>/SKILL.md`.** Use the
   structure below.
3. **Write scripts under `scripts/`.** Each must be:
   - **Standalone** — no shared CLI dependency, runnable via `bun run`.
   - **Idempotent** — rerun produces the same end state.
   - **Dry-run by default** — `--apply` flag to commit.
   - **Workspace-rooted** — read `LOOPANY_HOME` env var (default
     `~/loopany`); never assume cwd.
   - **Loud** — print every file it touched, with old → new path.
4. **Add an end-to-end test** under `test/` that builds a fixture old
   workspace, runs the scripts, and asserts `loopany doctor` passes.

### SKILL.md structure (required sections)

```markdown
---
name: migrate-v<from>-to-v<to>
description: One-line summary of what changed and why. Triggers when
  agent is told to migrate from v<from> to v<to>.
---

# v<from> → v<to>

## What changed

(2–5 bullets — top-level changes a user / agent needs to understand)

## Why

(motivation — what problem this solves; what we abandoned)

## Pre-flight

- `git -C $LOOPANY_HOME init` if not already a repo, then `git add -A
  && git commit -m "pre-migration snapshot"` so a bad migration is one
  `git reset --hard` away.
- `loopany doctor` — capture the baseline.

## Steps

(scripts in order — each step says what it does + how to verify)

1. `bun run skills/migrations/<name>/scripts/01-<step>.ts` — does X.
   Verify: <one assertion>.
2. ...

## Rollback

- `git -C $LOOPANY_HOME reset --hard HEAD` returns to pre-flight snapshot.
- Or per-script reversal if listed.

## Verification

`loopany doctor` must pass cleanly. Specific post-migration assertions:

- ...
```

## Principles

- **One migration = one minor version.** Don't write a script that
  handles multiple version jumps; chain migrations instead.
- **Don't share code with the main binary.** A migration script should
  never import from `src/core/` — it must work on the *old* on-disk
  format that the current binary no longer parses. Inline what you need.
- **Backwards-compat shims live nowhere.** Once a migration ships,
  the binary drops support for the previous format. Migration is the
  only path forward.
