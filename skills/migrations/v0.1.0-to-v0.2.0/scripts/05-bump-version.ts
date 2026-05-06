#!/usr/bin/env bun
// Migration step 05 — bump schemaVersion in config.yaml.
//
// This is the gate. After this step, `loopany doctor` should pass and
// every other CLI command stops complaining about version mismatch.
//
// Idempotent: a no-op when schemaVersion is already 0.2.0.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { workspaceRoot, isApply, logHeader } from './_lib.ts';

const TARGET_VERSION = '0.2.0';

async function main(): Promise<void> {
  const apply = isApply();
  logHeader('05-bump-version', apply);

  const root = workspaceRoot();
  const configPath = join(root, 'config.yaml');
  if (!existsSync(configPath)) {
    throw new Error(`no config.yaml at ${configPath} — workspace not initialized?`);
  }

  const raw = await readFile(configPath, 'utf-8');
  const data = (parseYaml(raw) ?? {}) as Record<string, unknown>;
  const current = (data.schemaVersion as string | undefined) ?? '0.1.0';

  console.log('');
  console.log(`current schemaVersion: ${current}`);
  console.log(`target schemaVersion:  ${TARGET_VERSION}`);

  if (current === TARGET_VERSION) {
    console.log('already at target — no change');
    return;
  }

  data.schemaVersion = TARGET_VERSION;

  if (!apply) {
    console.log('(dry-run; config.yaml not written)');
    return;
  }

  await writeFile(configPath, stringifyYaml(data), 'utf-8');
  console.log(`wrote ${configPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
