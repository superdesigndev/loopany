#!/usr/bin/env bun
// Migration step 01 — snapshot the v0.1 workspace.
//
// Read-only. Counts artifacts, validates IDs, detects slug collisions
// after prefix-strip. Output is the agent's pre-migration baseline.
//
// Idempotent (does nothing destructive). Always safe to rerun.

import { workspaceRoot, listOldArtifacts, newSlugFor, OLD_KIND_TABLE, logHeader, isApply } from './_lib.ts';

async function main(): Promise<void> {
  logHeader('01-snapshot', isApply());

  const root = workspaceRoot();
  const artifacts = await listOldArtifacts(root);

  // Per-kind counts
  const byKind: Record<string, number> = {};
  for (const a of artifacts) {
    byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  }

  console.log('');
  console.log(`artifacts found: ${artifacts.length}`);
  for (const kind of Object.keys(OLD_KIND_TABLE).sort()) {
    console.log(`  ${kind.padEnd(16)} ${byKind[kind] ?? 0}`);
  }

  // Slug collisions: two old artifacts that strip down to the same new slug.
  const bySlug: Record<string, string[]> = {};
  for (const a of artifacts) {
    const slug = newSlugFor(a.oldId);
    if (!slug) continue;
    bySlug[slug] = bySlug[slug] ?? [];
    bySlug[slug].push(a.oldId);
  }

  const collisions = Object.entries(bySlug).filter(([, ids]) => ids.length > 1);
  if (collisions.length === 0) {
    console.log('');
    console.log('no slug collisions ✓');
  } else {
    console.log('');
    console.log(`SLUG COLLISIONS (${collisions.length}) — fix before step 02:`);
    for (const [slug, ids] of collisions) {
      console.log(`  "${slug}":`);
      for (const id of ids) console.log(`    - ${id}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
