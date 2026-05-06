// Tests the v1 migration framework: schemaVersion field, bootstrap guard,
// `loopany migrate` discovery, doctor reporting. These are the only pieces
// that ship in phase 1 — the actual v0.1.0→v0.2.0 scripts come in phase 2.

import { describe, expect, test } from 'bun:test';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Config } from '../src/core/config.ts';
import { runCli, newWorkspace } from './helpers/cli.ts';
import { SCHEMA_VERSION } from '../src/version.ts';

describe('Config.schemaVersion', () => {
  test('absent field defaults to 0.1.0 (legacy assumption)', async () => {
    const ws = newWorkspace();
    writeFileSync(join(ws, 'config.yaml'), '# empty\n');
    const c = await Config.load(ws);
    expect(c.schemaVersion()).toBe('0.1.0');
  });

  test('reads schemaVersion from config.yaml', async () => {
    const ws = newWorkspace();
    writeFileSync(join(ws, 'config.yaml'), 'schemaVersion: 0.2.0\n');
    const c = await Config.load(ws);
    expect(c.schemaVersion()).toBe('0.2.0');
  });

  test('setSchemaVersion persists', async () => {
    const ws = newWorkspace();
    writeFileSync(join(ws, 'config.yaml'), '# empty\n');
    const c = await Config.load(ws);
    await c.setSchemaVersion('9.9.9');
    const reloaded = await Config.load(ws);
    expect(reloaded.schemaVersion()).toBe('9.9.9');
  });

  test('setSchemaVersion preserves enabled_domains', async () => {
    const ws = newWorkspace();
    writeFileSync(join(ws, 'config.yaml'), 'enabled_domains:\n  - crm\n');
    const c = await Config.load(ws);
    await c.setSchemaVersion('0.2.0');
    const reloaded = await Config.load(ws);
    expect(reloaded.enabledDomains()).toEqual(['crm']);
    expect(reloaded.schemaVersion()).toBe('0.2.0');
  });
});

describe('loopany init writes schemaVersion', () => {
  test('new workspace records the current SCHEMA_VERSION', async () => {
    const ws = newWorkspace();
    const r = await runCli(ws, 'init');
    expect(r.code).toBe(0);
    const config = readFileSync(join(ws, 'config.yaml'), 'utf-8');
    expect(config).toContain(`schemaVersion: ${SCHEMA_VERSION}`);
  });
});

describe('bootstrap version guard', () => {
  // The current SCHEMA_VERSION is 0.1.0 — no real mismatch is possible
  // with a fresh init. We force a stale workspace by writing an older
  // (or "future") version into config.yaml and expecting the failure.
  // Using "0.0.0" guarantees inequality regardless of what SCHEMA_VERSION
  // becomes after phase 2.

  test('list/get refuse to operate on a stale workspace', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    writeFileSync(
      join(ws, 'config.yaml'),
      'schemaVersion: 0.0.0\n',
    );
    const r = await runCli(ws, 'artifact', 'list');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('schema is v0.0.0');
    expect(r.stderr).toContain('loopany migrate');
  });

  test('LOOPANY_SKIP_VERSION_CHECK=1 bypasses the guard', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    writeFileSync(join(ws, 'config.yaml'), 'schemaVersion: 0.0.0\n');
    const proc = Bun.spawn(
      [
        'bun',
        join(import.meta.dir, '..', 'src', 'cli.ts'),
        'artifact',
        'list',
      ],
      {
        env: {
          ...process.env,
          LOOPANY_HOME: ws,
          LOOPANY_SKIP_VERSION_CHECK: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    void stderr;
    void stdout;
  });

  test('doctor surfaces version mismatch instead of crashing', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    writeFileSync(join(ws, 'config.yaml'), 'schemaVersion: 0.0.0\n');
    const r = await runCli(ws, 'doctor');
    // doctor exits 1 because the schema check failed — that's correct.
    // What matters is it reached the report (didn't crash) and surfaced
    // the migration pointer.
    expect(r.stdout.toLowerCase()).toContain('schema version');
    expect(r.stdout.toLowerCase()).toContain('loopany migrate');
  });
});

describe('loopany migrate', () => {
  test('with no args: lists current/binary versions', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const r = await runCli(ws, 'migrate');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Workspace schema:');
    expect(r.stdout).toContain('Binary expects:');
  });

  test('on up-to-date workspace, says so', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const r = await runCli(ws, 'migrate');
    expect(r.stdout).toContain('Up to date');
  });

  test('on stale workspace, suggests next migration if one exists', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    writeFileSync(join(ws, 'config.yaml'), 'schemaVersion: 0.0.0\n');
    const r = await runCli(ws, 'migrate');
    // "next migration" is only printed if a v0.0.0-to-v<current>/ directory
    // exists. The directory doesn't exist in phase 1, so we should see the
    // "no migration found" branch — that's the correct surface area.
    expect(r.stdout).toContain('Workspace schema: v0.0.0');
    expect(r.stdout.toLowerCase()).toMatch(/no migration found|next migration/);
  });

  test('describing an unknown migration errors cleanly', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const r = await runCli(ws, 'migrate', 'v0.1.0-to-v9.9.9');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Unknown migration');
  });
});

describe('skills/migrations/ scaffold', () => {
  test('README.md exists', () => {
    const readme = join(
      import.meta.dir,
      '..',
      'skills',
      'migrations',
      'README.md',
    );
    expect(existsSync(readme)).toBe(true);
    const body = readFileSync(readme, 'utf-8');
    expect(body).toContain('schemaVersion');
    expect(body).toContain('SKILL.md');
  });
});
