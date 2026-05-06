import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ArtifactStore } from '../src/core/artifact-store.ts';
import { KindRegistry } from '../src/core/kind-registry.ts';

async function setupRegistry(): Promise<KindRegistry> {
  const dir = mkdtempSync(join(tmpdir(), 'loopany-store-kinds-'));
  writeFileSync(
    join(dir, 'task.md'),
    `---
kind: task
indexedFields: [status]
---
## Frontmatter
\`\`\`yaml
title:  { type: string, required: true }
status: { type: enum, values: [todo, running, done, cancelled] }
\`\`\`
## Status machine
\`\`\`yaml
initial: todo
transitions:
  todo:    [running, done, cancelled]
  running: [done, cancelled]
\`\`\`
`,
  );
  writeFileSync(
    join(dir, 'person.md'),
    `---
kind: person
dirName: people
indexedFields: []
---
## Frontmatter
\`\`\`yaml
name: { type: string, required: true }
\`\`\`
`,
  );
  return KindRegistry.load(dir);
}

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'loopany-ws-'));
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  return root;
}

describe('ArtifactStore.create', () => {
  test('auto-mints a YYYYMMDD-HHMMSS-hex slug when none provided', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'Hello', status: 'todo' });
    expect(a.id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{3}$/);
    expect(a.path).toContain('/artifacts/tasks/');
    expect(a.frontmatter.title).toBe('Hello');
    expect(a.frontmatter.status).toBe('todo');
    expect(a.frontmatter.createdAt).toBeDefined();
    expect(a.frontmatter.updatedAt).toBeDefined();
  });

  test('creates with explicit slug under flat dir', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('person', { name: 'Alice Chen' }, '', { slug: 'alice-chen' });
    expect(a.id).toBe('alice-chen');
    expect(a.path).toContain('/artifacts/people/alice-chen.md');
  });

  test('rejects unknown kind', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    await expect(store.create('bogus', { title: 'x' })).rejects.toThrow(/unknown kind/i);
  });

  test('rejects invalid frontmatter (missing required)', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    await expect(store.create('task', { status: 'todo' })).rejects.toThrow();
  });

  test('rejects slugs with invalid characters', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const bad = [
      '../etc/passwd',
      'alice/bob',
      'alice\\bob',
      '.hidden',
      'alice chen',
      '-alice',
      'alice-',
      'alice--chen',
      '',
    ];
    for (const slug of bad) {
      await expect(
        store.create('person', { name: 'X' }, '', { slug }),
        `slug "${slug}" should be rejected`,
      ).rejects.toThrow(/slug:/i);
    }
  });

  test('rejects slugs over the length cap', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const tooLong = 'a'.repeat(61);
    await expect(
      store.create('person', { name: 'X' }, '', { slug: tooLong }),
    ).rejects.toThrow(/too long/i);
  });

  test('accepts canonical slugs (kebab, CJK, diacritics, underscore)', async () => {
    // Each slug needs its own workspace because case-insensitive filesystems
    // (macOS APFS) collide between e.g. `Alice` and `alice` even though the
    // slug validator treats them as distinct.
    const reg = await setupRegistry();
    const slugs = [
      'self',
      'alice',
      'alice-chen',
      'fundraising-2027',
      'a1',
      '2026-q2',
      'Alice',         // uppercase OK in v0.2
      '产品发布',       // CJK OK
      'café',          // diacritics OK
      'alice_chen',    // underscore OK
    ];
    for (const slug of slugs) {
      const root = newWorkspace();
      const store = new ArtifactStore(root, reg);
      const a = await store.create('person', { name: slug }, '', { slug });
      expect(a.id).toBe(slug);
    }
  });

  test('rejects collision with existing slug', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    await store.create('person', { name: 'Alice' }, '', { slug: 'alice' });
    await expect(
      store.create('person', { name: 'Alice2' }, '', { slug: 'alice' }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe('ArtifactStore.get', () => {
  test('round-trips through filesystem', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const created = await store.create('task', { title: 'Hello', status: 'todo' }, 'body text');
    const read = await store.get(created.id);
    expect(read).not.toBeNull();
    expect(read!.frontmatter.title).toBe('Hello');
    expect(read!.body).toContain('body text');
  });

  test('returns null for missing id', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);
    expect(await store.get('99999999-999999-fff')).toBeNull();
  });
});

describe('ArtifactStore.appendSection', () => {
  test('appends a new H2 section to body', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'running' }, 'intro');
    await store.appendSection(a.id, 'Outcome', 'shipped it');
    const updated = await store.get(a.id);
    expect(updated!.body).toContain('## Outcome');
    expect(updated!.body).toContain('shipped it');
  });
});

describe('ArtifactStore.setStatus', () => {
  test('happy path transition', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await store.setStatus(a.id, 'running');
    const updated = await store.get(a.id);
    expect(updated!.frontmatter.status).toBe('running');
  });

  test('rejects illegal transition', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await expect(store.setStatus(a.id, 'in_review')).rejects.toThrow(/transition/i);
  });

  test('--reason does NOT append a Status section to body', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'running' }, 'intro\n');
    await store.appendSection(a.id, 'Outcome', 'done');
    await store.setStatus(a.id, 'done', 'shipped');
    const updated = await store.get(a.id);
    expect(updated!.body).not.toContain('## Status');
    expect(updated!.body).toContain('intro');
    expect(updated!.body).toContain('## Outcome');
  });
});

describe('ArtifactStore.setField', () => {
  test('updates a string field', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await store.setField(a.id, 'title', 'updated');
    const updated = await store.get(a.id);
    expect(updated!.frontmatter.title).toBe('updated');
  });

  test('refuses to set the status field (must use setStatus)', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await expect(store.setField(a.id, 'status', 'done')).rejects.toThrow(/setStatus|status field/i);
  });

  test('rejects unknown fields', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await expect(store.setField(a.id, 'bogus', 'v')).rejects.toThrow(/unknown field/i);
  });

  test('accepts built-in fields (domain, createdAt, updatedAt, _backfilled)', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'x', status: 'todo' });
    await store.setField(a.id, 'domain', 'ads');
    const updated = await store.get(a.id);
    expect(updated!.frontmatter.domain).toBe('ads');
  });
});

describe('ArtifactStore.listAll', () => {
  test('lists all artifacts across kinds and dirs', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    await store.create('task', { title: 'a', status: 'todo' });
    await store.create('task', { title: 'b', status: 'todo' });
    await store.create('person', { name: 'Alice' }, '', { slug: 'alice' });

    const all = await store.listAll();
    expect(all.length).toBe(3);
    const kinds = all.map((a) => a.kind).sort();
    expect(kinds).toEqual(['person', 'task', 'task']);
  });

  test('ignores non-directory entries under artifacts/', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    writeFileSync(join(root, 'artifacts', '.DS_Store'), 'finder');
    await store.create('task', { title: 'a', status: 'todo' });

    await expect(store.listAll()).resolves.toHaveLength(1);
  });
});
