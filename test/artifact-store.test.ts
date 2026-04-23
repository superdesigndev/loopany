import { describe, expect, test, beforeEach } from 'bun:test';
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
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
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
  return KindRegistry.load(dir);
}

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'loopany-ws-'));
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  return root;
}

describe('ArtifactStore.create', () => {
  test('creates timestamp-based id under date-bucketed dir', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'Hello', status: 'todo' });
    expect(a.id).toMatch(/^tsk-\d{8}-\d{6}$/);
    expect(a.path).toContain('/artifacts/');
    expect(a.path).toMatch(/\/\d{4}-\d{2}\//);
    expect(a.frontmatter.title).toBe('Hello');
    expect(a.frontmatter.status).toBe('todo');
  });

  test('creates slug-based id under flat dir', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('person', { name: 'Alice Chen' }, '', { slug: 'alice-chen' });
    expect(a.id).toBe('prs-alice-chen');
    expect(a.path).toContain('/artifacts/people/prs-alice-chen.md');
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

  test('rejects slug strategy without explicit slug', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    await expect(store.create('person', { name: 'X' })).rejects.toThrow(/slug required/i);
  });

  test('handles same-second collision by appending -2', async () => {
    const root = newWorkspace();
    const reg = await setupRegistry();
    const store = new ArtifactStore(root, reg);

    const a = await store.create('task', { title: 'a', status: 'todo' });
    // Force same second by mocking — easier: just create back-to-back and accept
    // that occasionally the test won't collide. Better: mock the clock.
    // For v1 simplicity: pass an explicit "now" param to test the collision path.
    const b = await store.create('task', { title: 'b', status: 'todo' }, '', { now: a.id.slice(4) });
    expect(b.id).toBe(`${a.id}-2`);
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
    expect(await store.get('tsk-99999999-999999')).toBeNull();
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
    // Original body + Outcome still there; no reason pollution
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
});
