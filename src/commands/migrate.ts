// `loopany migrate` — discovery hook for schema migrations.
//
// This command does NOT execute migrations itself. Migrations live as
// runnable Bun scripts under `skills/migrations/v<from>-to-v<to>/scripts/`,
// invoked one at a time (dry-run by default, --apply to commit). The agent
// reads the skill's SKILL.md, then executes scripts in order via the shell.
//
// What this command does:
//   `loopany migrate`             — current schema version + available migrations
//   `loopany migrate <name>`      — print the migration's SKILL.md + script list
//
// Why no `--run`: making the CLI auto-execute would couple migration logic
// to the binary version that's running them. Keeping scripts standalone
// lets a user roll a workspace forward in steps, inspect intermediate
// states, and abort cleanly without partially-mutating runtime state.

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { resolve, join } from 'path';
import type { Engine } from '../core/engine.ts';
import { SCHEMA_VERSION } from '../version.ts';

// `skills/migrations/` lives next to `skills/loopany-core/` in the repo root.
const MIGRATIONS_DIR = resolve(import.meta.dir, '..', '..', 'skills', 'migrations');

const MIGRATION_NAME_RE = /^v(\d+\.\d+\.\d+)-to-v(\d+\.\d+\.\d+)$/;

export interface MigrationEntry {
  name: string;
  from: string;
  to: string;
  dir: string;
}

export interface MigrateListResult {
  workspaceVersion: string;
  binaryVersion: string;
  migrations: MigrationEntry[];
  /** Migration whose `from` matches the current workspace version. */
  next?: MigrationEntry;
}

export async function listMigrations(): Promise<MigrationEntry[]> {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const out: MigrationEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const m = MIGRATION_NAME_RE.exec(entry.name);
    if (!m) continue;
    out.push({
      name: entry.name,
      from: m[1],
      to: m[2],
      dir: join(MIGRATIONS_DIR, entry.name),
    });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}

export async function runMigrate(
  engine: Engine,
  args: string[],
): Promise<{ kind: 'list'; result: MigrateListResult } | { kind: 'describe'; entry: MigrationEntry; skill: string; scripts: string[] }> {
  const wsVersion = engine.config.schemaVersion();
  const migrations = await listMigrations();

  const target = args[0];
  if (!target) {
    const next = migrations.find((m) => m.from === wsVersion);
    return {
      kind: 'list',
      result: {
        workspaceVersion: wsVersion,
        binaryVersion: SCHEMA_VERSION,
        migrations,
        next,
      },
    };
  }

  const entry = migrations.find((m) => m.name === target);
  if (!entry) {
    throw new Error(
      `Unknown migration: ${target}. Run \`loopany migrate\` to see available ones.`,
    );
  }

  const skillPath = join(entry.dir, 'SKILL.md');
  const skill = existsSync(skillPath) ? await readFile(skillPath, 'utf-8') : '';

  const scriptsDir = join(entry.dir, 'scripts');
  let scripts: string[] = [];
  if (existsSync(scriptsDir)) {
    const files = await readdir(scriptsDir);
    scripts = files.filter((f) => f.endsWith('.ts')).sort();
  }

  return { kind: 'describe', entry, skill, scripts };
}

export function formatMigrateList(r: MigrateListResult): string {
  const lines: string[] = [];
  lines.push(`Workspace schema: v${r.workspaceVersion}`);
  lines.push(`Binary expects:   v${r.binaryVersion}`);
  lines.push('');
  if (r.workspaceVersion === r.binaryVersion) {
    lines.push('Up to date — no migration needed.');
  } else if (r.next) {
    lines.push(`Next migration:   ${r.next.name}`);
    lines.push(`                  loopany migrate ${r.next.name}`);
  } else {
    lines.push(
      `No migration found from v${r.workspaceVersion}. ` +
        `This shouldn't happen — file an issue.`,
    );
  }
  if (r.migrations.length > 0) {
    lines.push('');
    lines.push(`Available migrations (${r.migrations.length}):`);
    for (const m of r.migrations) {
      lines.push(`  ${m.name}`);
    }
  }
  return lines.join('\n') + '\n';
}

export function formatMigrateDescribe(
  entry: MigrationEntry,
  skill: string,
  scripts: string[],
): string {
  const lines: string[] = [];
  lines.push(`Migration: ${entry.name}  (v${entry.from} → v${entry.to})`);
  lines.push(`Location:  ${entry.dir}`);
  lines.push('');
  if (scripts.length > 0) {
    lines.push('Scripts (run in order):');
    for (const s of scripts) {
      lines.push(`  bun run ${join(entry.dir, 'scripts', s)} [--apply]`);
    }
    lines.push('');
  }
  lines.push('--- SKILL.md ---');
  lines.push('');
  lines.push(skill || '(no SKILL.md found)');
  return lines.join('\n') + '\n';
}
