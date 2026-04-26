import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { runCli, runCliWithStdin, newWorkspace } from './helpers/cli.ts';
import { writeFileSync } from 'fs';

async function init(): Promise<string> {
  const ws = newWorkspace();
  await runCli(ws, 'init');
  return ws;
}

describe('loopany init', () => {
  test('creates workspace scaffold with bundled kinds', async () => {
    const ws = newWorkspace();
    const r = await runCli(ws, 'init');
    expect(r.code).toBe(0);
    expect(existsSync(ws)).toBe(true);
    expect(existsSync(join(ws, 'kinds'))).toBe(true);
    expect(existsSync(join(ws, 'artifacts'))).toBe(true);
    expect(existsSync(join(ws, 'config.yaml'))).toBe(true);

    const kinds = readdirSync(join(ws, 'kinds'));
    expect(kinds.sort()).toEqual([
      'brief.md',
      'learning.md',
      'mission.md',
      'note.md',
      'person.md',
      'signal.md',
      'skill-proposal.md',
      'task.md',
    ]);
  });

  test('idempotent — running init twice does not error', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const r = await runCli(ws, 'init');
    expect(r.code).toBe(0);
  });

  test('prints onboarding hint when no active mission exists', async () => {
    const ws = newWorkspace();
    const r = await runCli(ws, 'init');
    expect(r.stdout).toContain('ONBOARDING');
    expect(r.stdout.toLowerCase()).toContain('mission');
  });

  test('writes an audit entry on init', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const audit = readFileSync(join(ws, 'audit.jsonl'), 'utf-8').trim().split('\n');
    expect(audit.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(audit[0]);
    expect(entry.op).toBe('init');
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('does not nag once a mission artifact exists', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    await runCli(
      ws, 'artifact', 'create',
      '--kind', 'mission', '--slug', 'ship-v1',
      '--title', 'Ship loopany v1', '--status', 'active',
    );
    const r = await runCli(ws, 'init');
    expect(r.stdout).not.toContain('ONBOARDING');
  });
});

describe('loopany kind list', () => {
  test('lists the default kinds after init', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');
    const r = await runCli(ws, 'kind', 'list');
    expect(r.code).toBe(0);
    const kinds = JSON.parse(r.stdout);
    expect(kinds.map((k: { kind: string }) => k.kind).sort()).toEqual([
      'brief',
      'learning',
      'mission',
      'note',
      'person',
      'signal',
      'skill-proposal',
      'task',
    ]);
  });

  test('errors helpfully when workspace not initialized', async () => {
    const ws = newWorkspace();
    const r = await runCli(ws, 'kind', 'list');
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('loopany init');
  });
});

describe('loopany artifact create', () => {
  test('creates a task artifact and writes file with frontmatter', async () => {
    const ws = await init();
    const r = await runCli(
      ws,
      'artifact', 'create',
      '--kind', 'task',
      '--title', 'Follow up with Alice',
      '--status', 'todo',
      '--priority', 'high',
      '--check-at', '2026-04-29',
      '--mentions', 'prs-alice,prs-bob',
      '--content', 'ping her about the contract',
    );
    expect(r.code).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.id).toMatch(/^tsk-\d{8}-\d{6}/);
    expect(result.kind).toBe('task');

    const fileContent = readFileSync(result.path, 'utf-8');
    expect(fileContent).toContain('title: Follow up with Alice');
    expect(fileContent).toContain('priority: high');
    expect(fileContent).toMatch(/check_at:\s*'?2026-04-29'?/);
    expect(fileContent).toContain('- prs-alice');
    expect(fileContent).toContain('- prs-bob');
    expect(fileContent).toContain('ping her about the contract');
  });

  test('creates a person artifact via --slug', async () => {
    const ws = await init();
    const r = await runCli(
      ws,
      'artifact', 'create',
      '--kind', 'person',
      '--slug', 'alice-chen',
      '--name', 'Alice Chen',
      '--aliases', 'alice,a.chen',
    );
    expect(r.code).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.id).toBe('prs-alice-chen');
    expect(existsSync(join(ws, 'artifacts/people/prs-alice-chen.md'))).toBe(true);
  });

  test('rejects invalid status enum with friendly error', async () => {
    const ws = await init();
    const r = await runCli(
      ws,
      'artifact', 'create',
      '--kind', 'task',
      '--title', 'x',
      '--status', 'bogus',
    );
    expect(r.code).not.toBe(0);
    // Friendly format: NOT raw zod JSON, but human-readable lines
    expect(r.stderr).not.toContain('"code":');
    expect(r.stderr).not.toContain('"path":');
    expect(r.stderr).toContain('status');
    expect(r.stderr.toLowerCase()).toMatch(/invalid|expected/);
  });

  test('rejects missing required field with friendly error', async () => {
    const ws = await init();
    const r = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--status', 'todo');
    expect(r.code).not.toBe(0);
    expect(r.stderr).not.toContain('"code":');
    expect(r.stderr).toContain('title');
    expect(r.stderr.toLowerCase()).toContain('required');
  });

  test('errors on unknown kind', async () => {
    const ws = await init();
    const r = await runCli(ws, 'artifact', 'create', '--kind', 'nope', '--title', 'x');
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('unknown kind');
  });
});

describe('body input — --content-file, stdin, escape guard', () => {
  test('--content-file reads body from a file with real newlines preserved', async () => {
    const ws = await init();
    const bodyPath = join(ws, '_body.md');
    writeFileSync(bodyPath, 'line one\n\nline two\n\nline three\n');

    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'note', '--slug', 'from-file', '--title', 'from-file',
      '--content-file', bodyPath,
    );
    expect(r.code).toBe(0);
    const path = JSON.parse(r.stdout).path;
    const file = readFileSync(path, 'utf-8');
    expect(file).toContain('line one\n\nline two\n\nline three');
    expect(file).not.toContain('\\n');
  });

  test('--content-file - reads body from stdin', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');

    const r = await runCliWithStdin(
      ws, 'para 1\n\npara 2\n',
      'artifact', 'create',
      '--kind', 'note', '--slug', 'from-stdin', '--title', 'from-stdin',
      '--content-file', '-',
    );
    expect(r.code).toBe(0);
    const path = JSON.parse(r.stdout).path;
    const file = readFileSync(path, 'utf-8');
    expect(file).toContain('para 1\n\npara 2');
  });

  test('rejects inline --content with literal \\n and no real newlines', async () => {
    const ws = await init();
    // Build an arg that carries the literal 4-char sequence `\n\n` with no real \n.
    const literal = 'first' + String.raw`\n\n` + 'second';
    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'note', '--slug', 'bad', '--title', 'bad',
      '--content', literal,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('literal');
    expect(r.stderr.toLowerCase()).toContain('shell');
    expect(r.stderr).toContain('--content-file');
  });

  test('accepts inline --content with real newlines even if it also has literal \\n', async () => {
    const ws = await init();
    // Mixed: has a real newline AND a literal `\n`. Not a shell-escape mistake.
    const mixed = 'code example: ' + String.raw`\n` + '\nsecond line';
    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'note', '--slug', 'mixed', '--title', 'mixed',
      '--content', mixed,
    );
    expect(r.code).toBe(0);
  });

  test('rejects passing both --content and --content-file', async () => {
    const ws = await init();
    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'note', '--slug', 'both', '--title', 'both',
      '--content', 'inline',
      '--content-file', '/does/not/matter',
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('either --content or --content-file');
  });

  test('artifact append accepts --content-file and rejects literal \\n', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'running');
    const id = JSON.parse(c.stdout).id;

    const bodyPath = join(ws, '_append.md');
    writeFileSync(bodyPath, 'outcome line A\n\noutcome line B\n');
    const ok = await runCli(ws, 'artifact', 'append', id, '--section', 'Outcome', '--content-file', bodyPath);
    expect(ok.code).toBe(0);

    const get = await runCli(ws, 'artifact', 'get', id);
    expect(get.stdout).toContain('outcome line A\n\noutcome line B');

    // Second append with literal \n — should be rejected
    const bad = await runCli(
      ws, 'artifact', 'append', id, '--section', 'Outcome',
      '--content', 'nope' + String.raw`\n\n` + 'still nope',
    );
    expect(bad.code).not.toBe(0);
    expect(bad.stderr.toLowerCase()).toContain('literal');
  });
});

describe('loopany artifact get', () => {
  test('returns raw markdown by default', async () => {
    const ws = await init();
    const create = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'task', '--title', 'Hello', '--status', 'todo', '--content', 'body here',
    );
    const id = JSON.parse(create.stdout).id;

    const r = await runCli(ws, 'artifact', 'get', id);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('---');
    expect(r.stdout).toContain('title: Hello');
    expect(r.stdout).toContain('body here');
  });

  test('--format json returns parsed object', async () => {
    const ws = await init();
    const create = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'task', '--title', 'Hello', '--status', 'todo',
    );
    const id = JSON.parse(create.stdout).id;
    writeFileSync(
      join(ws, 'audit.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), op: 'artifact.get', id, actor: 'cli', duration_ms: 1 }) + '\n',
      { flag: 'a' },
    );

    const r = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(r.code).toBe(0);
    const obj = JSON.parse(r.stdout);
    expect(obj.id).toBe(id);
    expect(obj.frontmatter.title).toBe('Hello');
    const ops = obj.audit.map((e: { op: string }) => e.op);
    expect(ops).toContain('artifact.create');
    expect(ops).not.toContain('artifact.get');
    const createAudit = obj.audit.find((e: { op: string }) => e.op === 'artifact.create');
    expect(createAudit.ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(createAudit.id).toBeUndefined();
    expect(createAudit.actor).toBeUndefined();
    expect(createAudit.duration_ms).toBeUndefined();
  });

  test('exits non-zero on missing id', async () => {
    const ws = await init();
    const r = await runCli(ws, 'artifact', 'get', 'tsk-99999999-999999');
    expect(r.code).not.toBe(0);
  });
});

describe('loopany artifact list', () => {
  test('returns empty array on fresh workspace', async () => {
    const ws = await init();
    const r = await runCli(ws, 'artifact', 'list');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  test('lists all kinds', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'running');
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'alice', '--name', 'Alice');

    const r = await runCli(ws, 'artifact', 'list');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(3);
  });

  test('--kind filters', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo');
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'alice', '--name', 'Alice');

    const r = await runCli(ws, 'artifact', 'list', '--kind', 'task');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe('task');
  });

  test('--status filters', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'running');

    const r = await runCli(ws, 'artifact', 'list', '--status', 'running');
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].frontmatter.title).toBe('b');
  });

  test('--<indexed-field> filters on a kind-declared indexed field', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--priority', 'high');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'todo', '--priority', 'low');

    const r = await runCli(ws, 'artifact', 'list', '--kind', 'task', '--priority', 'high');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { frontmatter: { title: string } }) => m.frontmatter.title)).toEqual(['a']);
  });

  test('--<array-field> matches if any element equals the query', async () => {
    const ws = await init();
    await runCli(
      ws, 'artifact', 'create', '--kind', 'person',
      '--slug', 'alice-chen', '--name', 'Alice',
      '--aliases', 'alice,a.chen',
    );
    await runCli(
      ws, 'artifact', 'create', '--kind', 'person',
      '--slug', 'bob-li', '--name', 'Bob',
      '--aliases', 'bob',
    );

    const r = await runCli(ws, 'artifact', 'list', '--kind', 'person', '--aliases', 'alice');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('prs-alice-chen');
  });

  test('combines multiple field filters (AND semantics)', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--priority', 'high');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'running', '--priority', 'high');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'c', '--status', 'todo', '--priority', 'low');

    const r = await runCli(ws, 'artifact', 'list', '--kind', 'task', '--status', 'todo', '--priority', 'high');
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { frontmatter: { title: string } }) => m.frontmatter.title)).toEqual(['a']);
  });

  test('--contains filters by body substring (case-insensitive)', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--content', 'working on Retention funnel');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'todo', '--content', 'activation metric tweak');

    const r = await runCli(ws, 'artifact', 'list', '--contains', 'retention');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { frontmatter: { title: string } }) => m.frontmatter.title)).toEqual(['a']);
  });

  test('--contains combines with field filters', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--content', 'retention work');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'running', '--content', 'retention work');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'c', '--status', 'todo', '--content', 'other');

    const r = await runCli(ws, 'artifact', 'list', '--kind', 'task', '--status', 'todo', '--contains', 'retention');
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { frontmatter: { title: string } }) => m.frontmatter.title)).toEqual(['a']);
  });

  test('--contains matches frontmatter string values (title)', async () => {
    const ws = await init();
    // Title contains "orbit" but body doesn't
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'Fix orbit drift', '--status', 'todo', '--content', 'see linked signal');
    // Unrelated
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'other', '--status', 'todo', '--content', 'nothing here');

    const r = await runCli(ws, 'artifact', 'list', '--contains', 'orbit');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { frontmatter: { title: string } }) => m.frontmatter.title)).toEqual(['Fix orbit drift']);
  });

  test('--contains matches frontmatter string[] values (aliases)', async () => {
    const ws = await init();
    await runCli(
      ws, 'artifact', 'create', '--kind', 'person',
      '--slug', 'alice-chen', '--name', 'Alice',
      '--aliases', 'achen,stargazer',
    );
    await runCli(
      ws, 'artifact', 'create', '--kind', 'person',
      '--slug', 'bob-li', '--name', 'Bob',
      '--aliases', 'bob',
    );

    // Substring of alias — full field equality wouldn't match
    const r = await runCli(ws, 'artifact', 'list', '--contains', 'stargaz');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.map((m: { id: string }) => m.id)).toEqual(['prs-alice-chen']);
  });
});

describe('loopany artifact append', () => {
  test('appends a section to body', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'x', '--status', 'running', '--content', 'intro');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'append', id, '--section', 'Outcome', '--content', 'shipped it');
    expect(r.code).toBe(0);

    const get = await runCli(ws, 'artifact', 'get', id);
    expect(get.stdout).toContain('## Outcome');
    expect(get.stdout).toContain('shipped it');
  });
});

describe('loopany artifact status', () => {
  test('happy path transition', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'x', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'status', id, 'running');
    expect(r.code).toBe(0);

    const get = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.status).toBe('running');
  });

  test('rejects illegal transition', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'x', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'status', id, 'in_review');
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('transition');
  });

});

describe('loopany refs', () => {
  test('add via --to flag and query out direction', async () => {
    const ws = await init();
    const s = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'noticed X')).stdout);
    const t = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'follow X', '--status', 'todo')).stdout);

    const add = await runCli(ws, 'refs', 'add', '--from', s.id, '--to', t.id, '--relation', 'led-to');
    expect(add.code).toBe(0);

    const out = await runCli(ws, 'refs', s.id, '--direction', 'out');
    const edges = JSON.parse(out.stdout);
    expect(edges.length).toBe(1);
    expect(edges[0].to).toBe(t.id);
    expect(edges[0].relation).toBe('led-to');

    const incoming = await runCli(ws, 'refs', t.id, '--direction', 'in');
    expect(JSON.parse(incoming.stdout).length).toBe(1);
  });

  test('--direction both returns combined', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'C', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', c.id, '--to', b.id, '--relation', 'follows-up');

    const r = await runCli(ws, 'refs', b.id, '--direction', 'both');
    const edges = JSON.parse(r.stdout);
    expect(edges.length).toBe(2);
  });

  test('--depth 2 walks two hops along --direction out', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'C', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', c.id, '--relation', 'led-to');

    const depth1 = JSON.parse((await runCli(ws, 'refs', a.id, '--direction', 'out', '--depth', '1')).stdout);
    expect(depth1.map((e: { to: string }) => e.to)).toEqual([b.id]);

    const depth2 = JSON.parse((await runCli(ws, 'refs', a.id, '--direction', 'out', '--depth', '2')).stdout);
    const tos = depth2.map((e: { to: string }) => e.to).sort();
    expect(tos).toEqual([b.id, c.id].sort());
  });

  test('--depth terminates on cycles without duplicate edges', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', a.id, '--relation', 'led-to');

    const r = JSON.parse((await runCli(ws, 'refs', a.id, '--direction', 'out', '--depth', '5')).stdout);
    expect(r.length).toBe(2);
  });

  test('--depth 2 with --relation prunes off-relation hops', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'C', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', c.id, '--relation', 'mentions');

    const r = JSON.parse((await runCli(ws, 'refs', a.id, '--direction', 'out', '--depth', '2', '--relation', 'led-to')).stdout);
    expect(r.length).toBe(1);
    expect(r[0].to).toBe(b.id);
  });

  test('--depth rejects non-positive integers', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const r = await runCli(ws, 'refs', a.id, '--depth', '0');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('Invalid --depth');
  });
});

describe('loopany trace', () => {
  test('walks led-to forward and backward from a middle node', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'A')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'learning', '--title', 'C')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', c.id, '--relation', 'led-to');

    const r = JSON.parse((await runCli(ws, 'trace', b.id)).stdout);
    expect(r.root).toBe(b.id);
    const byId: Record<string, number> = {};
    for (const n of r.nodes) byId[n.id] = n.distance;
    expect(byId[a.id]).toBe(-1);
    expect(byId[b.id]).toBe(0);
    expect(byId[c.id]).toBe(1);
    expect(r.edges.length).toBe(2);
    // Sorted ascending by distance — cause first, root middle, effect last.
    expect(r.nodes.map((n: { id: string }) => n.id)).toEqual([a.id, b.id, c.id]);
  });

  test('--direction forward only', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'A')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'learning', '--title', 'C')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', c.id, '--relation', 'led-to');

    const r = JSON.parse((await runCli(ws, 'trace', b.id, '--direction', 'forward')).stdout);
    expect(r.nodes.map((n: { id: string }) => n.id)).toEqual([b.id, c.id]);
  });

  test('default predicate set excludes mentions', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'mentions');

    const r = JSON.parse((await runCli(ws, 'trace', a.id)).stdout);
    expect(r.edges.length).toBe(0);
    expect(r.nodes.map((n: { id: string }) => n.id)).toEqual([a.id]);
  });

  test('--relations opts in to additional predicates', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'mentions');

    const r = JSON.parse((await runCli(ws, 'trace', a.id, '--relations', 'mentions')).stdout);
    expect(r.nodes.map((n: { id: string }) => n.id).sort()).toEqual([a.id, b.id].sort());
  });

  test('terminates on cycles', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', a.id, '--relation', 'led-to');

    const r = JSON.parse((await runCli(ws, 'trace', a.id, '--direction', 'forward')).stdout);
    // Two distinct edges, two nodes; no infinite loop.
    expect(r.edges.length).toBe(2);
    expect(r.nodes.length).toBe(2);
  });

  test('--max-depth caps the walk', async () => {
    const ws = await init();
    const a = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'A', '--status', 'todo')).stdout);
    const b = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'B', '--status', 'todo')).stdout);
    const c = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'C', '--status', 'todo')).stdout);
    await runCli(ws, 'refs', 'add', '--from', a.id, '--to', b.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', b.id, '--to', c.id, '--relation', 'led-to');

    const r = JSON.parse((await runCli(ws, 'trace', a.id, '--direction', 'forward', '--max-depth', '1')).stdout);
    expect(r.nodes.map((n: { id: string }) => n.id)).toEqual([a.id, b.id]);
  });

  test('rejects unknown id', async () => {
    const ws = await init();
    const r = await runCli(ws, 'trace', 'tsk-99999999-999999');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('No artifact');
  });
});

describe('loopany followups', () => {
  test('returns tasks with check_at <= today', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'past', '--status', 'todo', '--check-at', '2020-01-01');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'future', '--status', 'todo', '--check-at', '2099-12-31');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'no-check', '--status', 'todo');

    const r = await runCli(ws, 'followups', '--due', 'today');
    expect(r.code).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].frontmatter.title).toBe('past');
  });

  test('filters out terminal-status tasks (done, cancelled, failed) by default', async () => {
    const ws = await init();
    // Three past-due tasks in different statuses
    const todo = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'todo-task', '--status', 'todo', '--check-at', '2020-01-01')).stdout,
    );
    const cancel = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'will-cancel', '--status', 'todo', '--check-at', '2020-01-01')).stdout,
    );
    await runCli(ws, 'artifact', 'status', cancel.id, 'cancelled');

    const r = await runCli(ws, 'followups', '--due', 'today');
    const ids = JSON.parse(r.stdout).map((m: { id: string }) => m.id);
    expect(ids).toContain(todo.id);
    expect(ids).not.toContain(cancel.id);
  });

  test('--include-done overrides the terminal filter', async () => {
    const ws = await init();
    const t = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo', '--check-at', '2020-01-01')).stdout,
    );
    await runCli(ws, 'artifact', 'status', t.id, 'cancelled');

    const r = await runCli(ws, 'followups', '--due', 'today', '--include-done', 'true');
    const ids = JSON.parse(r.stdout).map((m: { id: string }) => m.id);
    expect(ids).toContain(t.id);
  });
});

describe('audit.jsonl', () => {
  test('records every artifact mutation', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;
    await runCli(ws, 'artifact', 'status', id, 'running');
    await runCli(ws, 'refs', 'add', '--from', id, '--to', id, '--relation', 'self');

    const audit = readFileSync(join(ws, 'audit.jsonl'), 'utf-8')
      .trim().split('\n').map((l) => JSON.parse(l));
    const ops = audit.map((e) => e.op);
    expect(ops).toContain('artifact.create');
    expect(ops).toContain('artifact.status');
    expect(ops).toContain('refs.add');
  });

  test('records errors with the error message', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'bogus', '--title', 'x');

    const audit = readFileSync(join(ws, 'audit.jsonl'), 'utf-8')
      .trim().split('\n').map((l) => JSON.parse(l));
    const errEntry = audit.find((e) => e.error);
    expect(errEntry).toBeDefined();
    expect(errEntry.error).toMatch(/unknown kind/i);
  });

  test('does not record body content (large fields are excluded)', async () => {
    const ws = await init();
    await runCli(
      ws, 'artifact', 'create',
      '--kind', 'task', '--title', 't', '--status', 'todo',
      '--content', 'this big paragraph should NOT be in audit log',
    );
    const audit = readFileSync(join(ws, 'audit.jsonl'), 'utf-8');
    expect(audit).not.toContain('this big paragraph');
  });
});

describe('loopany doctor', () => {
  test('reports onboarding incomplete on fresh workspace', async () => {
    const ws = await init();
    const r = await runCli(ws, 'doctor');
    expect(r.code).not.toBe(0);
    expect(r.stdout.toLowerCase()).toMatch(/onboard|prs-self|mission/);
  });

  test('all green after onboarding', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'Test User');
    await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g1', '--title', 'Test mission', '--status', 'active');

    const r = await runCli(ws, 'doctor');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Workspace');
    expect(r.stdout).toContain('Kinds');
    expect(r.stdout).toContain('Onboarding');
  });

  test('--json returns structured output', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');
    await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g', '--title', 't', '--status', 'active');

    const r = await runCli(ws, 'doctor', '--format', 'json');
    expect(r.code).toBe(0);
    const obj = JSON.parse(r.stdout);
    expect(obj.checks).toBeDefined();
    expect(obj.checks.find((c: { name: string }) => c.name === 'onboarding')).toBeDefined();
  });

  test('warns on mission coverage when artifacts have no mission mention', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');
    await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g', '--title', 't', '--status', 'active');
    // task without --mentions to a mission
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'orphan', '--status', 'todo');

    const r = await runCli(ws, 'doctor', '--format', 'json');
    expect(r.code).toBe(0); // warn, not fail
    const obj = JSON.parse(r.stdout);
    const coverage = obj.checks.find((c: { name: string }) => c.name === 'mission coverage');
    expect(coverage).toBeDefined();
    expect(coverage.status).toBe('warn');
    expect(coverage.problems[0]).toMatch(/orphan|no mission/i);
  });

  test('mission coverage passes when all artifacts mention a mission', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');
    const g = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g', '--title', 't', '--status', 'active')).stdout,
    );
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'tagged', '--status', 'todo', '--mentions', g.id);

    const r = await runCli(ws, 'doctor', '--format', 'json');
    const obj = JSON.parse(r.stdout);
    const coverage = obj.checks.find((c: { name: string }) => c.name === 'mission coverage');
    expect(coverage.status).toBe('ok');
  });

  test('warns on domain coverage when artifact has unenabled domain', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');
    const g = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g', '--title', 't', '--status', 'active')).stdout,
    );
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'orphan-d', '--status', 'todo', '--domain', 'unknown-d', '--mentions', g.id);

    const r = await runCli(ws, 'doctor', '--format', 'json');
    expect(r.code).toBe(0);
    const obj = JSON.parse(r.stdout);
    const dCoverage = obj.checks.find((c: { name: string }) => c.name === 'domain coverage');
    expect(dCoverage).toBeDefined();
    expect(dCoverage.status).toBe('warn');
    expect(JSON.stringify(dCoverage.problems)).toContain('unknown-d');
  });

  test('detects dangling references', async () => {
    const ws = await init();
    const t = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo')).stdout);
    // Dangling: target doesn't exist
    await runCli(ws, 'refs', 'add', '--from', t.id, '--to', 'tsk-99999999-999999', '--relation', 'led-to');

    const r = await runCli(ws, 'doctor');
    expect(r.code).not.toBe(0);
    expect(r.stdout.toLowerCase()).toContain('dangling');
  });
});

describe('loopany artifact set', () => {
  test('updates a frontmatter field', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'old', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'set', id, '--field', 'title', '--value', 'new title');
    expect(r.code).toBe(0);

    const get = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.title).toBe('new title');
  });

  test('flips signal status to dismissed', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'noticed X');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'status', id, 'dismissed', '--reason', 'false positive');
    expect(r.code).toBe(0);
    const get = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.status).toBe('dismissed');
  });

  test('flips signal to addressed and emits an addresses edge', async () => {
    const ws = await init();
    const sig = await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'noticed Y');
    const sigId = JSON.parse(sig.stdout).id;
    const tsk = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'fix Y', '--status', 'todo');
    const tskId = JSON.parse(tsk.stdout).id;

    const r = await runCli(ws, 'artifact', 'status', sigId, 'addressed', '--addressed-by', tskId);
    expect(r.code).toBe(0);
    const get = await runCli(ws, 'artifact', 'get', sigId, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.status).toBe('addressed');

    const refs = await runCli(ws, 'refs', sigId, '--direction', 'in', '--relation', 'addresses');
    const edges = JSON.parse(refs.stdout);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(tskId);
    expect(edges[0].to).toBe(sigId);
  });

  test('rejects addressed transition without --addressed-by', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'signal', '--title', 'noticed Z');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'status', id, 'addressed');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/addressed-by/);
  });

  test('rejects setting status field', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;

    const r = await runCli(ws, 'artifact', 'set', id, '--field', 'status', '--value', 'done');
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toMatch(/setstatus|status field/);
  });
});

describe('domain field on artifacts', () => {
  test('create accepts --domain and writes it to frontmatter', async () => {
    const ws = await init();
    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'task',
      '--title', 't',
      '--status', 'todo',
      '--domain', 'crm',
    );
    expect(r.code).toBe(0);
    const id = JSON.parse(r.stdout).id;

    const get = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.domain).toBe('crm');
  });

  test('artifact set can update domain after creation', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo');
    const id = JSON.parse(c.stdout).id;

    await runCli(ws, 'artifact', 'set', id, '--field', 'domain', '--value', 'ads');
    const get = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    expect(JSON.parse(get.stdout).frontmatter.domain).toBe('ads');
  });

  test('--domain is not rejected as an unknown kind field', async () => {
    const ws = await init();
    const r = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'person',
      '--slug', 'alice',
      '--name', 'Alice',
      '--domain', 'crm',
    );
    expect(r.code).toBe(0);
  });
});

describe('--domain filter', () => {
  test('artifact list --domain filters', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--domain', 'crm');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'todo', '--domain', 'ads');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'c', '--status', 'todo'); // no domain

    const r = await runCli(ws, 'artifact', 'list', '--domain', 'crm');
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].frontmatter.title).toBe('a');
  });

  test('followups --domain filters', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'crm-due', '--status', 'todo', '--check-at', '2020-01-01', '--domain', 'crm');
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'ads-due', '--status', 'todo', '--check-at', '2020-01-01', '--domain', 'ads');

    const r = await runCli(ws, 'followups', '--due', 'today', '--domain', 'crm');
    const items = JSON.parse(r.stdout);
    expect(items.length).toBe(1);
    expect(items[0].frontmatter.title).toBe('crm-due');
  });

  test('refs --domain filters edges by source artifact domain', async () => {
    const ws = await init();
    const crmA = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'crm-a', '--status', 'todo', '--domain', 'crm')).stdout);
    const crmB = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'crm-b', '--status', 'todo', '--domain', 'crm')).stdout);
    const adsX = JSON.parse((await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'ads-x', '--status', 'todo', '--domain', 'ads')).stdout);
    await runCli(ws, 'refs', 'add', '--from', crmA.id, '--to', crmB.id, '--relation', 'led-to');
    await runCli(ws, 'refs', 'add', '--from', crmA.id, '--to', adsX.id, '--relation', 'led-to');

    const r = await runCli(ws, 'refs', crmA.id, '--direction', 'out', '--domain', 'crm');
    const edges = JSON.parse(r.stdout);
    expect(edges.length).toBe(1);
    expect(edges[0].to).toBe(crmB.id);
  });
});

describe('loopany domain', () => {
  test('list on fresh workspace shows empty enabled + empty observed', async () => {
    const ws = await init();
    const r = await runCli(ws, 'domain', 'list');
    expect(r.code).toBe(0);
    const obj = JSON.parse(r.stdout);
    expect(obj.enabled).toEqual([]);
    expect(obj.observed_only).toEqual([]);
  });

  test('enable + list round-trip', async () => {
    const ws = await init();
    await runCli(ws, 'domain', 'enable', 'crm');
    await runCli(ws, 'domain', 'enable', 'ads');
    const r = await runCli(ws, 'domain', 'list');
    expect(JSON.parse(r.stdout).enabled.sort()).toEqual(['ads', 'crm']);
  });

  test('disable removes', async () => {
    const ws = await init();
    await runCli(ws, 'domain', 'enable', 'crm');
    await runCli(ws, 'domain', 'disable', 'crm');
    const r = await runCli(ws, 'domain', 'list');
    expect(JSON.parse(r.stdout).enabled).toEqual([]);
  });

  test('observed_only lists domains seen in artifacts but not enabled', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo', '--domain', 'unknown-d');
    const r = await runCli(ws, 'domain', 'list');
    const obj = JSON.parse(r.stdout);
    expect(obj.observed_only).toContain('unknown-d');
  });
});

describe('domain pack kinds', () => {
  test('kind from ~/loopany/domains/<name>/kinds/ loads only when domain is enabled', async () => {
    const { writeFileSync, mkdirSync } = await import('fs');
    const ws = await init();
    // Write a domain pack kind BEFORE enabling
    mkdirSync(join(ws, 'domains', 'crm', 'kinds'), { recursive: true });
    writeFileSync(
      join(ws, 'domains', 'crm', 'kinds', 'deal.md'),
      `---
kind: deal
idPrefix: dea-
bodyMode: append
storage: flat
idStrategy: slug
dirName: deals
indexedFields: [status]
---
## Frontmatter
\`\`\`yaml
title:  { type: string, required: true }
status: { type: enum, values: [open, won, lost] }
\`\`\`
`,
    );

    // Before enable: kind list does NOT include deal
    const before = JSON.parse((await runCli(ws, 'kind', 'list')).stdout);
    expect(before.map((k: { kind: string }) => k.kind)).not.toContain('deal');

    // Enable the domain
    await runCli(ws, 'domain', 'enable', 'crm');

    // After enable: kind list DOES include deal
    const after = JSON.parse((await runCli(ws, 'kind', 'list')).stdout);
    expect(after.map((k: { kind: string }) => k.kind)).toContain('deal');

    // Can create an artifact of the new kind
    const r = await runCli(ws, 'artifact', 'create', '--kind', 'deal', '--slug', 'acme-q2', '--title', 'Acme Q2', '--status', 'open', '--domain', 'crm');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).id).toBe('dea-acme-q2');
  });

  test('disabling a domain hides its kinds but keeps existing artifacts readable', async () => {
    const { writeFileSync, mkdirSync } = await import('fs');
    const ws = await init();
    mkdirSync(join(ws, 'domains', 'crm', 'kinds'), { recursive: true });
    writeFileSync(
      join(ws, 'domains', 'crm', 'kinds', 'deal.md'),
      `---
kind: deal
idPrefix: dea-
bodyMode: append
storage: flat
idStrategy: slug
dirName: deals
indexedFields: []
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`,
    );
    await runCli(ws, 'domain', 'enable', 'crm');
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'deal', '--slug', 'x', '--title', 'x', '--domain', 'crm');
    const id = JSON.parse(c.stdout).id;

    await runCli(ws, 'domain', 'disable', 'crm');

    // kind list no longer shows deal
    const kinds = JSON.parse((await runCli(ws, 'kind', 'list')).stdout);
    expect(kinds.map((k: { kind: string }) => k.kind)).not.toContain('deal');

    // but listing artifacts that happen to be of a disabled kind: the file on
    // disk is still there. Loading the index would skip artifacts whose prefix
    // no longer maps to a loaded kind — that's OK for v1, with a doctor warning.
    // We verify the file persists:
    const { existsSync } = await import('fs');
    expect(existsSync(join(ws, 'artifacts', 'deals', `${id}.md`))).toBe(true);
  });
});

describe('--reason audit trail', () => {
  test('status --reason lands in audit.jsonl, not in body', async () => {
    const ws = await init();
    const c = await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'running');
    const id = JSON.parse(c.stdout).id;
    await runCli(ws, 'artifact', 'append', id, '--section', 'Outcome', '--content', 'shipped');
    await runCli(ws, 'artifact', 'status', id, 'done', '--reason', 'customer signed');

    // Body should NOT contain "## Status: done" or "customer signed"
    const get = await runCli(ws, 'artifact', 'get', id);
    expect(get.stdout).not.toContain('## Status');
    expect(get.stdout).not.toContain('customer signed');

    // Audit SHOULD contain the reason
    const audit = readFileSync(join(ws, 'audit.jsonl'), 'utf-8')
      .trim().split('\n').map((l) => JSON.parse(l));
    const statusEntry = audit.find((e) => e.op === 'artifact.status' && e.new_status === 'done');
    expect(statusEntry).toBeDefined();
    expect(statusEntry.reason).toBe('customer signed');

    const jsonGet = await runCli(ws, 'artifact', 'get', id, '--format', 'json');
    const obj = JSON.parse(jsonGet.stdout);
    const jsonStatusEntry = obj.audit.find((e: { op: string; new_status?: string }) => {
      return e.op === 'artifact.status' && e.new_status === 'done';
    });
    expect(jsonStatusEntry.reason).toBe('customer signed');
  });
});

describe('frontmatter mentions as implicit graph edges', () => {
  test('mentions in frontmatter is queryable via refs (outgoing)', async () => {
    const ws = await init();
    const person = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'alice', '--name', 'Alice')).stdout,
    );
    const task = JSON.parse(
      (await runCli(
        ws, 'artifact', 'create',
        '--kind', 'task', '--title', 't', '--status', 'todo',
        '--mentions', person.id,
      )).stdout,
    );

    const r = await runCli(ws, 'refs', task.id, '--direction', 'out');
    const edges = JSON.parse(r.stdout);
    expect(edges.length).toBe(1);
    expect(edges[0].to).toBe(person.id);
    expect(edges[0].relation).toBe('mentions');
    expect(edges[0].implicit).toBe(true);
  });

  test('mentions in frontmatter is queryable via refs (incoming)', async () => {
    const ws = await init();
    const person = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'bob', '--name', 'Bob')).stdout,
    );
    const a = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'a', '--status', 'todo', '--mentions', person.id)).stdout,
    );
    const b = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 'b', '--status', 'todo', '--mentions', person.id)).stdout,
    );

    const r = await runCli(ws, 'refs', person.id, '--direction', 'in');
    const edges = JSON.parse(r.stdout);
    const froms = edges.map((e: { from: string }) => e.from).sort();
    expect(froms).toEqual([a.id, b.id].sort());
    expect(edges.every((e: { implicit: boolean }) => e.implicit)).toBe(true);
  });

  test('explicit refs.add edges coexist with implicit frontmatter edges', async () => {
    const ws = await init();
    const p = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'carol', '--name', 'C')).stdout,
    );
    // Task with mentions in frontmatter
    const t = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo', '--mentions', p.id)).stdout,
    );
    // Explicit refs.add from the same task to the same target but different relation
    await runCli(ws, 'refs', 'add', '--from', t.id, '--to', p.id, '--relation', 'led-to');

    const out = JSON.parse((await runCli(ws, 'refs', t.id, '--direction', 'out')).stdout);
    expect(out.length).toBe(2);
    const implicit = out.find((e: { implicit?: boolean }) => e.implicit);
    const explicit = out.find((e: { implicit?: boolean }) => !e.implicit);
    expect(implicit.relation).toBe('mentions');
    expect(explicit.relation).toBe('led-to');
  });

  test('--relation filter works on implicit edges', async () => {
    const ws = await init();
    const p = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'dan', '--name', 'D')).stdout,
    );
    const t = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'task', '--title', 't', '--status', 'todo', '--mentions', p.id)).stdout,
    );

    const mentionsOnly = JSON.parse(
      (await runCli(ws, 'refs', p.id, '--direction', 'in', '--relation', 'mentions')).stdout,
    );
    expect(mentionsOnly.length).toBe(1);

    const ledToOnly = JSON.parse(
      (await runCli(ws, 'refs', p.id, '--direction', 'in', '--relation', 'led-to')).stdout,
    );
    expect(ledToOnly.length).toBe(0);
  });
});

describe('body [[link]] as implicit graph edges', () => {
  test('body [[id]] becomes an implicit mention edge', async () => {
    const ws = await init();
    const person = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'alice', '--name', 'Alice')).stdout,
    );
    const task = JSON.parse(
      (await runCli(
        ws, 'artifact', 'create',
        '--kind', 'task', '--title', 't', '--status', 'todo',
        '--content', `pairing with [[${person.id}]] on the refactor`,
      )).stdout,
    );

    const r = await runCli(ws, 'refs', person.id, '--direction', 'in');
    const edges = JSON.parse(r.stdout);
    const fromBody = edges.find((e: { from: string; actor: string }) => e.from === task.id);
    expect(fromBody).toBeDefined();
    expect(fromBody.implicit).toBe(true);
    expect(fromBody.actor).toBe('body');
    expect(fromBody.relation).toBe('mentions');
  });

  test('code-block [[id]] does NOT generate an edge', async () => {
    const ws = await init();
    const person = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'bob', '--name', 'B')).stdout,
    );
    const task = JSON.parse(
      (await runCli(
        ws, 'artifact', 'create',
        '--kind', 'task', '--title', 't', '--status', 'todo',
        '--content', '```\nexample: [[' + person.id + ']]\n```\nno real mention here',
      )).stdout,
    );

    const r = await runCli(ws, 'refs', person.id, '--direction', 'in');
    const edges = JSON.parse(r.stdout);
    expect(edges.find((e: { from: string }) => e.from === task.id)).toBeUndefined();
  });

  test('body link to unknown prefix is ignored (no edge, no dangling)', async () => {
    const ws = await init();
    await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'self', '--name', 'X');
    const g = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'mission', '--slug', 'g', '--title', 't', '--status', 'active')).stdout,
    );
    const task = JSON.parse(
      (await runCli(
        ws, 'artifact', 'create',
        '--kind', 'task', '--title', 't', '--status', 'todo',
        '--mentions', g.id,
        '--content', 'see [[foo-bar]] for context',
      )).stdout,
    );

    // Only the frontmatter mentions edge should exist — [[foo-bar]] is ignored
    const edges = JSON.parse((await runCli(ws, 'refs', task.id, '--direction', 'out')).stdout);
    expect(edges.length).toBe(1);
    expect(edges[0].to).toBe(g.id);

    const doc = await runCli(ws, 'doctor');
    expect(doc.code).toBe(0);
    expect(doc.stdout).not.toContain('DANGLING');
  });

  test('frontmatter + body links combine (both show up)', async () => {
    const ws = await init();
    const a = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'a', '--name', 'A')).stdout,
    );
    const b = JSON.parse(
      (await runCli(ws, 'artifact', 'create', '--kind', 'person', '--slug', 'b', '--name', 'B')).stdout,
    );
    const task = JSON.parse(
      (await runCli(
        ws, 'artifact', 'create',
        '--kind', 'task', '--title', 't', '--status', 'todo',
        '--mentions', a.id,
        '--content', `talked with [[${b.id}]] today`,
      )).stdout,
    );

    const out = JSON.parse((await runCli(ws, 'refs', task.id, '--direction', 'out')).stdout);
    expect(out.length).toBe(2);
    const actors = out.map((e: { actor: string }) => e.actor).sort();
    expect(actors).toEqual(['body', 'frontmatter']);
  });
});
