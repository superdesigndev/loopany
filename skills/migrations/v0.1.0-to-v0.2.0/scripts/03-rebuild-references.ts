#!/usr/bin/env bun
// Migration step 03 — rewrite references.jsonl with new IDs.
//
// references.jsonl rows: {"ts","from","to","relation","actor"}
// We rewrite `from` and `to` through the id map produced by step 02.
// Edges whose endpoint isn't in the map are kept verbatim (could be hand
// edits or future-format entries).
//
// Idempotent: running twice produces the same file (the id map is a
// surjection from old → new; rewriting an already-new id is a no-op).
//
// Backs up the original to references.jsonl.v0.1.bak on first --apply run.

import { existsSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot, isApply, logHeader, readIdMap } from './_lib.ts';

interface Edge {
  ts?: string;
  from?: string;
  to?: string;
  relation?: string;
  actor?: string;
  [k: string]: unknown;
}

async function main(): Promise<void> {
  const apply = isApply();
  logHeader('03-rebuild-references', apply);

  const root = workspaceRoot();
  const refsPath = join(root, 'references.jsonl');
  if (!existsSync(refsPath)) {
    console.log('  references.jsonl not present — nothing to rebuild');
    return;
  }

  const idMap = await readIdMap(root);
  if (!idMap) {
    throw new Error(
      `id-map not found (.migration-id-map.json). Run step 02 first.`,
    );
  }

  const raw = await readFile(refsPath, 'utf-8');
  const lines = raw.split('\n');
  const out: string[] = [];
  let rewrote = 0;
  let preserved = 0;
  let dropped = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let row: Edge;
    try {
      row = JSON.parse(line) as Edge;
    } catch {
      console.warn(`  ! malformed line dropped: ${line.slice(0, 80)}…`);
      dropped++;
      continue;
    }
    const fromMapped = row.from && idMap.byOldId[row.from]?.newId;
    const toMapped = row.to && idMap.byOldId[row.to]?.newId;
    const newRow: Edge = {
      ...row,
      from: fromMapped ?? row.from,
      to: toMapped ?? row.to,
    };
    if (fromMapped || toMapped) rewrote++;
    else preserved++;
    out.push(JSON.stringify(newRow));
  }

  const next = out.join('\n') + (out.length > 0 ? '\n' : '');

  console.log('');
  console.log(`rows rewritten: ${rewrote}`);
  console.log(`rows preserved: ${preserved}`);
  if (dropped > 0) console.log(`rows dropped (malformed): ${dropped}`);

  if (!apply) {
    console.log('(dry-run; references.jsonl not written)');
    return;
  }

  const backup = `${refsPath}.v0.1.bak`;
  if (!existsSync(backup)) {
    await copyFile(refsPath, backup);
    console.log(`backed up original → ${backup}`);
  }
  await writeFile(refsPath, next, 'utf-8');
  console.log(`wrote ${refsPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
