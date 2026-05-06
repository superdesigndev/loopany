#!/usr/bin/env bun
// Migration step 06 — refresh kinds/ with the bundled v0.2 definitions.
//
// `loopany init` copies kinds/*.md once and never overwrites. After a
// schema bump, the workspace's kinds/ still carries the old definitions
// (with `idPrefix`, snake_case field names, etc.) which v0.2 commands
// reject when the user adds a frontmatter field.
//
// This step copies every file from the source tree's
// `skills/loopany-core/kinds/` into the workspace's `kinds/`, overwriting
// any same-named file. Files that exist in the workspace but not in the
// bundled set (user-added kinds) are left alone.
//
// Idempotent: rerunning produces the same final state.

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { workspaceRoot, isApply, logHeader } from './_lib.ts';

// Resolve relative to this script: scripts/ → v0.1.0-to-v0.2.0/ →
// migrations/ → skills/ → loopany-core/kinds/
const BUNDLED_KINDS = resolve(import.meta.dir, '..', '..', '..', 'loopany-core', 'kinds');

async function main(): Promise<void> {
  const apply = isApply();
  logHeader('06-refresh-kinds', apply);

  const root = workspaceRoot();
  const dst = join(root, 'kinds');

  if (!existsSync(BUNDLED_KINDS)) {
    throw new Error(
      `bundled kinds dir not found at ${BUNDLED_KINDS} — running outside the source tree?`,
    );
  }
  await mkdir(dst, { recursive: true });

  const files = (await readdir(BUNDLED_KINDS)).filter((f) => f.endsWith('.md'));

  console.log('');
  for (const f of files) {
    const src = join(BUNDLED_KINDS, f);
    const target = join(dst, f);
    const action = existsSync(target) ? 'overwrite' : 'add';
    console.log(`  ${action.padEnd(9)} ${target}`);
    if (apply) await copyFile(src, target);
  }

  console.log('');
  console.log(`refreshed ${files.length} kind file(s)${apply ? '' : ' (dry-run)'}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
