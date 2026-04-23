import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ArtifactIndex } from '../src/core/index.ts';
import { ArtifactStore } from '../src/core/artifact-store.ts';
import { ReferenceGraph } from '../src/core/references.ts';
import { KindRegistry } from '../src/core/kind-registry.ts';

async function makeStack() {
  const kindsDir = mkdtempSync(join(tmpdir(), 'loopany-idx-kinds-'));
  writeFileSync(
    join(kindsDir, 'task.md'),
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
## Status machine
\`\`\`yaml
initial: todo
transitions:
  todo:    [running, done]
  running: [done]
\`\`\`
`,
  );
  writeFileSync(
    join(kindsDir, 'signal.md'),
    `---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: []
---
## Frontmatter
\`\`\`yaml
summary: { type: string, required: true }
\`\`\`
`,
  );

  const root = mkdtempSync(join(tmpdir(), 'loopany-idx-ws-'));
  mkdirSync(join(root, 'artifacts'), { recursive: true });

  const registry = await KindRegistry.load(kindsDir);
  const store = new ArtifactStore(root, registry);
  const refs = new ReferenceGraph(join(root, 'references.jsonl'));
  return { root, registry, store, refs };
}

describe('ArtifactIndex.build', () => {
  test('indexes by id, kind, status', async () => {
    const { store, refs } = await makeStack();
    const t1 = await store.create('task', { title: 'a', status: 'todo' });
    const t2 = await store.create('task', { title: 'b', status: 'running' }, '', { now: t1.id.slice(4) + '+1' });
    const s1 = await store.create('signal', { summary: 'hi' });

    const idx = await ArtifactIndex.build(store, refs);

    expect(idx.byId(t1.id)?.kind).toBe('task');
    expect(idx.byKind('task').map((m) => m.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(idx.byKind('signal').map((m) => m.id)).toEqual([s1.id]);
    expect(idx.byStatus('todo').map((m) => m.id)).toEqual([t1.id]);
    expect(idx.byStatus('running').map((m) => m.id)).toEqual([t2.id]);
  });

  test('integrates forward + reverse refs', async () => {
    const { store, refs } = await makeStack();
    const s = await store.create('signal', { summary: 'x' });
    const t = await store.create('task', { title: 'y', status: 'todo' });
    await refs.append({ from: s.id, to: t.id, relation: 'led-to', actor: 'cli' });

    const idx = await ArtifactIndex.build(store, refs);
    expect(idx.refsOut(s.id)).toHaveLength(1);
    expect(idx.refsIn(t.id)).toHaveLength(1);
    expect(idx.refsOut(t.id)).toHaveLength(0);
  });

  test('followups returns artifacts with check_at <= today', async () => {
    const { store, refs } = await makeStack();
    await store.create('task', { title: 'past', status: 'todo', check_at: '2020-01-01' });
    await store.create('task', { title: 'future', status: 'todo', check_at: '2099-12-31' }, '', { now: '20200101-000000' });
    await store.create('task', { title: 'no-check', status: 'todo' }, '', { now: '20200101-000001' });

    const idx = await ArtifactIndex.build(store, refs);
    const due = idx.followups(new Date('2026-04-22'));
    expect(due.map((m) => m.frontmatter.title)).toEqual(['past']);
  });

  test('byField returns artifacts matching an indexed field', async () => {
    const { store, registry, refs } = await makeStack();
    const t1 = await store.create('task', { title: 'a', status: 'todo' });
    const t2 = await store.create('task', { title: 'b', status: 'running' }, '', { now: t1.id.slice(4) + '+1' });
    const t3 = await store.create('task', { title: 'c', status: 'todo' }, '', { now: t1.id.slice(4) + '+2' });

    const idx = await ArtifactIndex.build(store, refs, registry);
    const todos = idx.byField('task', 'status', 'todo').map((m) => m.id).sort();
    expect(todos).toEqual([t1.id, t3.id].sort());
    expect(idx.byField('task', 'status', 'running').map((m) => m.id)).toEqual([t2.id]);
  });

  test('byField returns [] for non-indexed field or unknown kind', async () => {
    const { store, registry, refs } = await makeStack();
    await store.create('task', { title: 'a', status: 'todo' });

    const idx = await ArtifactIndex.build(store, refs, registry);
    // 'title' is not in indexedFields for task → not indexed
    expect(idx.byField('task', 'title', 'a')).toEqual([]);
    expect(idx.byField('unknown-kind', 'status', 'todo')).toEqual([]);
    expect(idx.byField('task', 'status', 'never-used-value')).toEqual([]);
  });

  test('byField indexes each element of array-typed fields separately', async () => {
    // Build a stack with a person-like kind whose aliases (string[]) is indexed.
    const kindsDir = mkdtempSync(join(tmpdir(), 'loopany-idx-kinds2-'));
    writeFileSync(
      join(kindsDir, 'person.md'),
      `---
kind: person
idPrefix: prs-
bodyMode: append
storage: flat
idStrategy: slug
dirName: people
indexedFields: [aliases]
---
## Frontmatter
\`\`\`yaml
name:    { type: string, required: true }
aliases: { type: 'string[]', required: false }
\`\`\`
`,
    );
    const root = mkdtempSync(join(tmpdir(), 'loopany-idx-ws2-'));
    mkdirSync(join(root, 'artifacts'), { recursive: true });
    const registry = await KindRegistry.load(kindsDir);
    const store = new ArtifactStore(root, registry);
    const refs = new ReferenceGraph(join(root, 'references.jsonl'));

    const alice = await store.create(
      'person',
      { name: 'Alice', aliases: ['alice', 'a.chen'] },
      '',
      { slug: 'alice-chen' },
    );
    await store.create(
      'person',
      { name: 'Bob', aliases: ['bob'] },
      '',
      { slug: 'bob-li' },
    );

    const idx = await ArtifactIndex.build(store, refs, registry);
    expect(idx.byField('person', 'aliases', 'alice').map((m) => m.id)).toEqual([alice.id]);
    expect(idx.byField('person', 'aliases', 'a.chen').map((m) => m.id)).toEqual([alice.id]);
    expect(idx.byField('person', 'aliases', 'bob')).toHaveLength(1);
    expect(idx.byField('person', 'aliases', 'nobody')).toEqual([]);
  });

  test('byField without registry yields no matches (index is empty)', async () => {
    const { store, refs } = await makeStack();
    await store.create('task', { title: 'a', status: 'todo' });

    const idx = await ArtifactIndex.build(store, refs); // registry omitted
    expect(idx.byField('task', 'status', 'todo')).toEqual([]);
  });
});
