// End-to-end test for the v0.1.0 → v0.2.0 migration.
//
// Builds a synthetic v0.1 workspace (with `idPrefix` kind defs, date-bucketed
// artifacts, snake_case frontmatter, prefixed references), runs the 5
// migration scripts in order, then asserts:
//
//   - doctor passes (schema version OK, no dangling refs, all artifacts valid)
//   - artifacts moved to flat `artifacts/<dirName>/<slug>.md` paths
//   - frontmatter renamed to camelCase, createdAt/updatedAt stamped,
//     `_backfilled: true` added
//   - references.jsonl rewrites old IDs to new slugs
//   - journal entries built from createdAt
//   - config.yaml carries `schemaVersion: 0.2.0`
//
// Each script is invoked via `bun run` exactly the way an agent would,
// so this test exercises the agent-facing surface end-to-end.

import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPTS_DIR = resolve(
  import.meta.dir,
  '..',
  'skills',
  'migrations',
  'v0.1.0-to-v0.2.0',
  'scripts',
);

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runScript(workspace: string, name: string, apply = true): Promise<RunResult> {
  const args: string[] = ['run', join(SCRIPTS_DIR, name)];
  if (apply) args.push('--apply');
  const proc = Bun.spawn(['bun', ...args], {
    env: {
      ...process.env,
      LOOPANY_HOME: workspace,
      LOOPANY_SKIP_VERSION_CHECK: '1',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode ?? -1 };
}

const CLI_PATH = resolve(import.meta.dir, '..', 'src', 'cli.ts');

async function runCli(workspace: string, ...args: string[]): Promise<RunResult> {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    env: { ...process.env, LOOPANY_HOME: workspace },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode ?? -1 };
}

/**
 * Build a v0.1-shaped workspace:
 *   config.yaml without schemaVersion, kind defs in old format, artifacts
 *   in {YYYY-MM}/ buckets with prefixed ids and snake_case frontmatter,
 *   references.jsonl using prefixed ids.
 *
 * Real v0.1 workspaces have the kind .md files copied from the bundled
 * skills/loopany-core/kinds/ — we inline minimal v0.1-shaped versions
 * here because the bundled files have already been rewritten to v0.2.
 */
function buildV01Workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'loopany-mig-e2e-'));

  // No schemaVersion → load() defaults to '0.1.0'.
  writeFileSync(join(root, 'config.yaml'), '# legacy v0.1 workspace\n');

  mkdirSync(join(root, 'kinds'), { recursive: true });
  writeFileSync(
    join(root, 'kinds', 'task.md'),
    `---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status, check_at]
---
## Frontmatter
\`\`\`yaml
title:    { type: string, required: true }
status:   { type: enum, values: [todo, running, done] }
check_at: { type: date, required: false }
\`\`\`
`,
  );
  writeFileSync(
    join(root, 'kinds', 'signal.md'),
    `---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status]
---
## Frontmatter
\`\`\`yaml
title:  { type: string, required: true }
status: { type: enum, values: [open, addressed, dismissed], default: open }
\`\`\`
`,
  );
  writeFileSync(
    join(root, 'kinds', 'mission.md'),
    `---
kind: mission
idPrefix: mis-
bodyMode: append
storage: flat
idStrategy: slug
dirName: missions
indexedFields: [status]
---
## Frontmatter
\`\`\`yaml
title:  { type: string, required: true }
status: { type: enum, values: [active, paused, satisfied, abandoned] }
\`\`\`
`,
  );
  writeFileSync(
    join(root, 'kinds', 'person.md'),
    `---
kind: person
idPrefix: prs-
bodyMode: append
storage: flat
idStrategy: slug
dirName: people
indexedFields: []
---
## Frontmatter
\`\`\`yaml
name: { type: string, required: true }
\`\`\`
`,
  );

  // Date-bucketed artifacts
  mkdirSync(join(root, 'artifacts', '2026-04'), { recursive: true });
  writeFileSync(
    join(root, 'artifacts', '2026-04', 'sig-20260427-103045.md'),
    `---
title: CAC spiked 40% week over week
status: open
domain: ads
---

Observed in PostHog dashboard. Look into channel mix.
`,
  );
  writeFileSync(
    join(root, 'artifacts', '2026-04', 'tsk-20260428-091500.md'),
    `---
title: Audit ad channel attribution
status: done
priority: high
check_at: 2026-05-15
mentions: [sig-20260427-103045]
---

## Outcome

Found tagging gap on Twitter. See [[sig-20260427-103045]] for context.
`,
  );

  // Flat-storage artifacts
  mkdirSync(join(root, 'artifacts', 'missions'), { recursive: true });
  writeFileSync(
    join(root, 'artifacts', 'missions', 'mis-fundraising-2027.md'),
    `---
title: Fundraising 2027
status: active
hypothesis: Series A by Q2
---

Mission body.
`,
  );

  mkdirSync(join(root, 'artifacts', 'people'), { recursive: true });
  writeFileSync(
    join(root, 'artifacts', 'people', 'prs-self.md'),
    `---
name: Tim Shi
---

Profile body.
`,
  );

  // References with prefixed ids
  writeFileSync(
    join(root, 'references.jsonl'),
    `{"ts":"2026-04-28T09:20:00Z","from":"tsk-20260428-091500","to":"sig-20260427-103045","relation":"addresses","actor":"cli"}\n`,
  );

  return root;
}

describe('migrate v0.1.0 → v0.2.0 (end-to-end)', () => {
  test('runs all 5 scripts and lands in a doctor-clean v0.2 workspace', async () => {
    const ws = buildV01Workspace();

    // Pre-condition: any normal CLI command refuses because the binary now
    // expects v0.2.0 but the workspace is at the legacy default v0.1.0.
    const blocked = await runCli(ws, 'artifact', 'list');
    expect(blocked.code).not.toBe(0);
    expect(blocked.stderr).toContain('schema');

    // Step 01: snapshot — read-only, exit 0, finds 4 artifacts, no collisions.
    const snap = await runScript(ws, '01-snapshot.ts', false);
    expect(snap.code).toBe(0);
    expect(snap.stdout).toContain('artifacts found: 4');
    expect(snap.stdout).toContain('no slug collisions');

    // Step 02: transform.
    const transform = await runScript(ws, '02-transform-artifacts.ts');
    expect(transform.code).toBe(0);
    expect(transform.stdout).toContain('transformed: 4');

    // The id map was persisted.
    const mapPath = join(ws, '.migration-id-map.json');
    expect(existsSync(mapPath)).toBe(true);
    const idMap = JSON.parse(readFileSync(mapPath, 'utf-8')) as {
      byOldId: Record<string, { newId: string; newPath: string }>;
    };
    expect(idMap.byOldId['sig-20260427-103045'].newId).toBe('20260427-103045');
    expect(idMap.byOldId['mis-fundraising-2027'].newId).toBe('fundraising-2027');
    expect(idMap.byOldId['prs-self'].newId).toBe('self');

    // Files are at new paths, old date bucket is gone.
    expect(existsSync(join(ws, 'artifacts', 'tasks', '20260428-091500.md'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts', 'signals', '20260427-103045.md'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts', 'missions', 'fundraising-2027.md'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts', 'people', 'self.md'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts', '2026-04'))).toBe(false);

    // Frontmatter rewritten: camelCase, createdAt set, _backfilled flagged,
    // mentions[] uses new slugs, body wiki-link rewritten.
    const taskRaw = readFileSync(join(ws, 'artifacts', 'tasks', '20260428-091500.md'), 'utf-8');
    expect(taskRaw).toContain('checkAt: 2026-05-15');
    expect(taskRaw).not.toContain('check_at:');
    expect(taskRaw).toContain('createdAt: 2026-04-28T09:15:00.000Z');
    expect(taskRaw).toContain('_backfilled: true');
    expect(taskRaw).toContain('- 20260427-103045');
    expect(taskRaw).toContain('[[20260427-103045]]');
    expect(taskRaw).not.toContain('[[sig-');

    // Step 03: rebuild references with new ids.
    const refs = await runScript(ws, '03-rebuild-references.ts');
    expect(refs.code).toBe(0);
    expect(refs.stdout).toContain('rows rewritten: 1');
    const refsContent = readFileSync(join(ws, 'references.jsonl'), 'utf-8');
    expect(refsContent).toContain('"from":"20260428-091500"');
    expect(refsContent).toContain('"to":"20260427-103045"');
    expect(refsContent).not.toContain('tsk-');
    expect(refsContent).not.toContain('sig-');
    // Backup preserved
    expect(existsSync(join(ws, 'references.jsonl.v0.1.bak'))).toBe(true);

    // Step 04: build journal entries.
    const journal = await runScript(ws, '04-build-journal.ts');
    expect(journal.code).toBe(0);
    // 3 distinct dates: signal-2026-04-27, task-2026-04-28, mission/person-today.
    expect(journal.stdout).toContain('journal entries to write: 3');
    expect(existsSync(join(ws, 'artifacts', 'journal', '2026', '2026-04-27.md'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts', 'journal', '2026', '2026-04-28.md'))).toBe(true);
    const j27 = readFileSync(join(ws, 'artifacts', 'journal', '2026', '2026-04-27.md'), 'utf-8');
    expect(j27).toContain('## Backfilled');
    expect(j27).toContain('[[20260427-103045]]');
    expect(j27).toContain('CAC spiked');

    // Step 05: bump version.
    const bump = await runScript(ws, '05-bump-version.ts');
    expect(bump.code).toBe(0);
    expect(readFileSync(join(ws, 'config.yaml'), 'utf-8')).toContain('schemaVersion: 0.2.0');

    // Step 06: refresh kinds/ with bundled v0.2 definitions.
    const refresh = await runScript(ws, '06-refresh-kinds.ts');
    expect(refresh.code).toBe(0);
    expect(refresh.stdout).toContain('refreshed');
    // Spot-check: task.md no longer carries idPrefix.
    expect(readFileSync(join(ws, 'kinds', 'task.md'), 'utf-8')).not.toContain('idPrefix');

    // Doctor passes (workspace is now real v0.2 — kinds, schema version,
    // refs all valid).
    const doc = await runCli(ws, 'doctor');
    // `self` person + `fundraising-2027` mission both exist → onboarding ok.
    // No dangling refs. Everything valid.
    expect(doc.code).toBe(0);
    expect(doc.stdout).toContain('✓');
    expect(doc.stdout.toLowerCase()).toContain('schema version');
    expect(doc.stdout).not.toContain('✗');

    // Pre-condition reversed: regular commands work again.
    const list = await runCli(ws, 'artifact', 'list', '--kind', 'task');
    expect(list.code).toBe(0);
    const tasks = JSON.parse(list.stdout);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('20260428-091500');
  });

  test('scripts are idempotent — rerunning each is a no-op', async () => {
    const ws = buildV01Workspace();
    for (const script of [
      '02-transform-artifacts.ts',
      '03-rebuild-references.ts',
      '04-build-journal.ts',
      '05-bump-version.ts',
      '06-refresh-kinds.ts',
    ]) {
      const first = await runScript(ws, script);
      expect(first.code).toBe(0);
      const second = await runScript(ws, script);
      expect(second.code).toBe(0);
    }
    // Second runs of 02 should report 0 transformed (state already final).
    const reTransform = await runScript(ws, '02-transform-artifacts.ts');
    expect(reTransform.stdout).toContain('transformed: 0');
    // Re-run of 05 should say "already at target".
    const reBump = await runScript(ws, '05-bump-version.ts');
    expect(reBump.stdout).toContain('already at target');
  });
});
