// `loopany init` — scaffold the workspace at $LOOPANY_HOME (default ~/loopany)
// and copy bundled kind definitions. Idempotent: missing pieces get created,
// existing files are left alone.

import { existsSync, readdirSync } from 'fs';
import { mkdir, readdir, copyFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { getWorkspaceRoot } from '../core/engine.ts';

const BUNDLED_KINDS = resolve(import.meta.dir, '..', '..', 'skills', 'loopany-core', 'kinds');

export async function runInit(): Promise<{ root: string; created: string[]; needsOnboarding: boolean }> {
  const root = getWorkspaceRoot();
  const created: string[] = [];

  await ensureDir(root, created);
  await ensureDir(join(root, 'kinds'), created);
  await ensureDir(join(root, 'artifacts'), created);

  const configPath = join(root, 'config.yaml');
  if (!existsSync(configPath)) {
    await writeFile(configPath, '# loopany workspace config\n', 'utf-8');
    created.push(configPath);
  }

  for (const file of await readdir(BUNDLED_KINDS)) {
    if (!file.endsWith('.md')) continue;
    const dst = join(root, 'kinds', file);
    if (existsSync(dst)) continue;
    await copyFile(join(BUNDLED_KINDS, file), dst);
    created.push(dst);
  }

  const needsOnboarding = !hasAnyMission(root);
  return { root, created, needsOnboarding };
}

function hasAnyMission(root: string): boolean {
  const dir = join(root, 'artifacts', 'missions');
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith('.md'));
}

async function ensureDir(path: string, created: string[]): Promise<void> {
  if (existsSync(path)) return;
  await mkdir(path, { recursive: true });
  created.push(path);
}
