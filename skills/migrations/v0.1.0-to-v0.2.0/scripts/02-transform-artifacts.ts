#!/usr/bin/env bun
// Migration step 02 — transform every v0.1 artifact in one pass.
//
// For each artifact:
//   1. Compute new slug (strip kind prefix).
//   2. Read + parse markdown.
//   3. Rewrite frontmatter:
//      - rename snake_case fields → camelCase
//      - rewrite mentions[] entries through id-map
//      - add createdAt (from timestamp id, or stat mtime for slugs)
//      - add updatedAt = createdAt
//      - add _backfilled: true (routes to journal Backfilled section)
//   4. Rewrite [[old-id]] wiki-links in body to [[new-slug]].
//   5. Write to new path: artifacts/<dirName>/<new-slug>.md
//   6. Delete old file (when --apply).
//
// Persists `<workspace>/.migration-id-map.json` for steps 03–04.
//
// Idempotent: an artifact already at its new path with v0.2 frontmatter
// (no idPrefix-style id, has createdAt) is skipped.

import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  workspaceRoot,
  isApply,
  logHeader,
  parseMarkdown,
  serializeMarkdown,
  listOldArtifacts,
  newSlugFor,
  renameKeysCamel,
  isoFromTimestampId,
  ID_MAP_FILE,
  type IdMap,
  type IdMapEntry,
  type OldArtifactRef,
} from './_lib.ts';

interface PlanStep {
  ref: OldArtifactRef;
  newId: string;
  newPath: string;
  createdAt: string;
}

const ALL_OLD_PREFIXES = ['brf-', 'lrn-', 'mis-', 'nte-', 'prs-', 'sig-', 'spr-', 'tsk-'];

async function main(): Promise<void> {
  const apply = isApply();
  logHeader('02-transform-artifacts', apply);

  const root = workspaceRoot();
  const artifacts = await listOldArtifacts(root);

  // Build the plan: every artifact's new slug + createdAt.
  const plan: PlanStep[] = [];
  for (const a of artifacts) {
    const slug = newSlugFor(a.oldId);
    if (!slug) {
      console.warn(`  ! skip ${a.path} — no kind prefix match`);
      continue;
    }
    const newPath = join(root, 'artifacts', a.entry.dirName, `${slug}.md`);
    const tsCreatedAt = isoFromTimestampId(a.oldId);
    let createdAt: string;
    if (tsCreatedAt) {
      createdAt = tsCreatedAt;
    } else {
      const st = await stat(a.path);
      createdAt = st.mtime.toISOString();
    }
    plan.push({ ref: a, newId: slug, newPath, createdAt });
  }

  // Build the id map first (in memory). We need it complete before
  // rewriting any single body — wiki-link substitutions reach across
  // artifacts.
  const idMap: IdMap = { byOldId: {} };
  for (const step of plan) {
    const entry: IdMapEntry = {
      oldId: step.ref.oldId,
      newId: step.newId,
      kind: step.ref.kind,
      newPath: step.newPath,
      createdAt: step.createdAt,
    };
    if (idMap.byOldId[step.ref.oldId]) {
      throw new Error(`duplicate oldId: ${step.ref.oldId}`);
    }
    idMap.byOldId[step.ref.oldId] = entry;
  }

  // Wiki-link rewrite regex matches [[<old-id>]] for any of our 8 prefixes.
  // We only rewrite ids that are in the map — unknown [[…]] are left alone.
  const wikiLinkRe = new RegExp(
    `\\[\\[(${ALL_OLD_PREFIXES.map(escapeRegex).join('|')})([a-z0-9][a-z0-9-]*)\\]\\]`,
    'g',
  );

  // Now do the transforms.
  let transformed = 0;
  let skipped = 0;
  for (const step of plan) {
    const a = step.ref;

    // Idempotency: already migrated? (file already at new path AND old path
    // is gone)
    if (existsSync(step.newPath) && step.newPath !== a.path) {
      // Old path still exists too → partial run, redo it.
      if (!existsSync(a.path)) {
        skipped++;
        continue;
      }
    }

    const raw = await readFile(a.path, 'utf-8');
    const { frontmatter, body } = parseMarkdown(raw);

    // Frontmatter rewrite
    let nextFm = renameKeysCamel(frontmatter);

    // mentions[] field rewrite
    if (Array.isArray(nextFm.mentions)) {
      nextFm.mentions = (nextFm.mentions as string[]).map(
        (m) => idMap.byOldId[m]?.newId ?? m,
      );
    }

    // createdAt / updatedAt
    if (typeof nextFm.createdAt !== 'string') nextFm.createdAt = step.createdAt;
    if (typeof nextFm.updatedAt !== 'string') nextFm.updatedAt = step.createdAt;

    // _backfilled marker
    nextFm._backfilled = true;

    // Body wiki-link rewrite
    const nextBody = body.replace(wikiLinkRe, (_, prefix, slug) => {
      const oldId = `${prefix}${slug}`;
      const mapped = idMap.byOldId[oldId];
      return mapped ? `[[${mapped.newId}]]` : `[[${oldId}]]`;
    });

    const nextRaw = serializeMarkdown({ frontmatter: nextFm, body: nextBody });

    console.log(`  ${a.path}`);
    console.log(`    → ${step.newPath}`);

    if (apply) {
      await mkdir(dirname(step.newPath), { recursive: true });
      await writeFile(step.newPath, nextRaw, 'utf-8');
      if (a.path !== step.newPath) {
        await rm(a.path);
      }
    }
    transformed++;
  }

  // Persist id-map for the next steps.
  const mapPath = join(root, ID_MAP_FILE);
  if (apply) {
    await writeFile(mapPath, JSON.stringify(idMap, null, 2), 'utf-8');
  }

  // Sweep empty {YYYY-MM}/ dirs
  if (apply) {
    const { readdir, rmdir } = await import('node:fs/promises');
    const artifactsDir = join(root, 'artifacts');
    if (existsSync(artifactsDir)) {
      const entries = await readdir(artifactsDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (!/^\d{4}-\d{2}$/.test(e.name)) continue;
        const dir = join(artifactsDir, e.name);
        const left = await readdir(dir);
        if (left.length === 0) {
          await rmdir(dir);
          console.log(`  sweep empty ${dir}`);
        }
      }
    }
  }

  console.log('');
  console.log(`transformed: ${transformed}, skipped: ${skipped}`);
  console.log(`id map → ${mapPath}${apply ? '' : ' (dry-run; not written)'}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
