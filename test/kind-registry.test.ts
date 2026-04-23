import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseKindDefinition, KindRegistry } from '../src/core/kind-registry.ts';

const TASK_KIND = `---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status, priority, scheduled_for, check_at]
---

# task

A unit of work.

## Frontmatter

\`\`\`yaml
title:         { type: string, required: true }
status:        { type: enum, values: [todo, running, done, cancelled] }
priority:      { type: enum, values: [low, medium, high, critical], default: medium }
check_at:      { type: date, required: false }
mentions:      { type: 'string[]', required: false }
\`\`\`

## Status machine

\`\`\`yaml
initial: todo
transitions:
  todo:    [running, done, cancelled]
  running: [done, cancelled]
\`\`\`
`;

describe('parseKindDefinition', () => {
  test('parses top-level frontmatter', () => {
    const def = parseKindDefinition(TASK_KIND);
    expect(def.kind).toBe('task');
    expect(def.idPrefix).toBe('tsk-');
    expect(def.storage).toBe('date-bucketed');
    expect(def.idStrategy).toBe('timestamp');
    expect(def.indexedFields).toEqual(['status', 'priority', 'scheduled_for', 'check_at']);
  });

  test('defaults dirName to {kind}s', () => {
    const def = parseKindDefinition(TASK_KIND);
    expect(def.dirName).toBe('tasks');
  });

  test('parses status machine', () => {
    const def = parseKindDefinition(TASK_KIND);
    expect(def.statusMachine).toBeDefined();
    expect(def.statusMachine!.initial).toBe('todo');
    expect(def.statusMachine!.transitions.todo).toEqual(['running', 'done', 'cancelled']);
  });

  test('builds zod schema that validates required fields', () => {
    const def = parseKindDefinition(TASK_KIND);
    expect(() => def.frontmatterSchema.parse({})).toThrow();
    expect(() =>
      def.frontmatterSchema.parse({ title: 'x', status: 'todo' }),
    ).not.toThrow();
  });

  test('zod schema rejects invalid enum values', () => {
    const def = parseKindDefinition(TASK_KIND);
    expect(() =>
      def.frontmatterSchema.parse({ title: 'x', status: 'bogus' }),
    ).toThrow();
  });

  test('zod schema accepts string array fields', () => {
    const def = parseKindDefinition(TASK_KIND);
    const ok = def.frontmatterSchema.parse({
      title: 'x',
      status: 'todo',
      mentions: ['prs-alice', 'prs-bob'],
    });
    expect(ok.mentions).toEqual(['prs-alice', 'prs-bob']);
  });
});

describe('parseKindDefinition (flat storage)', () => {
  const PERSON_KIND = `---
kind: person
idPrefix: prs-
bodyMode: append
storage: flat
idStrategy: slug
dirName: people
indexedFields: [aliases]
---

# person

## Frontmatter

\`\`\`yaml
name:    { type: string, required: true }
aliases: { type: 'string[]', required: false }
\`\`\`
`;

  test('respects explicit dirName', () => {
    const def = parseKindDefinition(PERSON_KIND);
    expect(def.dirName).toBe('people');
    expect(def.storage).toBe('flat');
    expect(def.idStrategy).toBe('slug');
  });

  test('person kind has no status machine', () => {
    const def = parseKindDefinition(PERSON_KIND);
    expect(def.statusMachine).toBeUndefined();
  });
});

describe('KindRegistry', () => {
  function setupDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-'));
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
status: { type: enum, values: [todo, done] }
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
    return dir;
  }

  test('loads all kind files from a directory', async () => {
    const dir = setupDir();
    const reg = await KindRegistry.load(dir);
    expect(reg.list().map((k) => k.kind).sort()).toEqual(['person', 'task']);
  });

  test('get returns definition by kind name', async () => {
    const reg = await KindRegistry.load(setupDir());
    expect(reg.get('task')!.idPrefix).toBe('tsk-');
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  test('getByPrefix returns definition by id prefix', async () => {
    const reg = await KindRegistry.load(setupDir());
    expect(reg.getByPrefix('tsk-')!.kind).toBe('task');
    expect(reg.getByPrefix('prs-')!.kind).toBe('person');
    expect(reg.getByPrefix('xxx-')).toBeUndefined();
  });

  test('throws on duplicate kind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-dup-'));
    const def = `---
kind: task
idPrefix: tsk-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: []
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`;
    writeFileSync(join(dir, 'task.md'), def);
    writeFileSync(join(dir, 'task-dup.md'), def);
    await expect(KindRegistry.load(dir)).rejects.toThrow(/duplicate kind/i);
  });
});
