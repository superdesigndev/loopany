import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseKindDefinition, KindRegistry } from '../src/core/kind-registry.ts';

const TASK_KIND = `---
kind: task
indexedFields: [status, priority, checkAt]
---

# task

A unit of work.

## Frontmatter

\`\`\`yaml
title:    { type: string, required: true }
status:   { type: enum, values: [todo, running, done, cancelled] }
priority: { type: enum, values: [low, medium, high, critical], default: medium }
checkAt:  { type: date, required: false }
mentions: { type: 'string[]', required: false }
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
    expect(def.dirName).toBe('tasks');
    expect(def.slugLayout).toBe('flat');
    expect(def.indexedFields).toEqual(['status', 'priority', 'checkAt']);
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
      mentions: ['alice', 'bob'],
    });
    expect(ok.mentions).toEqual(['alice', 'bob']);
  });
});

describe('parseKindDefinition (flat-vs-year)', () => {
  const PERSON_KIND = `---
kind: person
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

  const JOURNAL_KIND = `---
kind: journal
dirName: journal
slugLayout: year
indexedFields: [date]
---

# journal

## Frontmatter

\`\`\`yaml
date: { type: date, required: true }
\`\`\`
`;

  test('respects explicit dirName', () => {
    const def = parseKindDefinition(PERSON_KIND);
    expect(def.dirName).toBe('people');
    expect(def.slugLayout).toBe('flat');
  });

  test('person kind has no status machine', () => {
    const def = parseKindDefinition(PERSON_KIND);
    expect(def.statusMachine).toBeUndefined();
  });

  test('parses slugLayout: year', () => {
    const def = parseKindDefinition(JOURNAL_KIND);
    expect(def.slugLayout).toBe('year');
  });

  test('rejects unknown slugLayout', () => {
    expect(() =>
      parseKindDefinition(`---
kind: bad
slugLayout: monthly
---
`),
    ).toThrow(/slugLayout/);
  });
});

describe('KindRegistry', () => {
  function setupDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-'));
    writeFileSync(
      join(dir, 'task.md'),
      `---
kind: task
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
    expect(reg.get('task')!.dirName).toBe('tasks');
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  test('getByDirName returns definition by directory', async () => {
    const reg = await KindRegistry.load(setupDir());
    expect(reg.getByDirName('tasks')!.kind).toBe('task');
    expect(reg.getByDirName('people')!.kind).toBe('person');
    expect(reg.getByDirName('nope')).toBeUndefined();
  });

  test('records duplicate kind as issue, keeps first one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-dup-'));
    const def = `---
kind: task
indexedFields: []
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`;
    writeFileSync(join(dir, 'task.md'), def);
    writeFileSync(join(dir, 'task-dup.md'), def);
    const reg = await KindRegistry.load(dir);
    expect(reg.list().map((k) => k.kind)).toEqual(['task']);
    expect(reg.issues).toHaveLength(1);
    expect(reg.issues[0].error).toMatch(/duplicate kind/i);
    expect(reg.issues[0].file).toMatch(/(task|task-dup)\.md$/);
  });

  test('records broken kind file as issue, keeps good ones loadable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-bad-'));
    writeFileSync(
      join(dir, 'good.md'),
      `---
kind: task
indexedFields: []
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`,
    );
    // Missing top-level `kind` field — parseKindDefinition should reject.
    writeFileSync(
      join(dir, 'broken.md'),
      `---
dirName: bad
---
## Frontmatter
\`\`\`yaml
name: { type: string, required: true }
\`\`\`
`,
    );

    const reg = await KindRegistry.load(dir);
    expect(reg.list().map((k) => k.kind)).toEqual(['task']);
    expect(reg.issues).toHaveLength(1);
    expect(reg.issues[0].file).toMatch(/broken\.md$/);
    expect(reg.issues[0].error).toMatch(/kind/);
  });

  test('records YAML syntax errors as issues, not throws', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopany-kinds-yaml-'));
    writeFileSync(
      join(dir, 'good.md'),
      `---
kind: task
indexedFields: []
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`,
    );
    // Unterminated flow mapping in top-level frontmatter — YAML parser will throw.
    writeFileSync(
      join(dir, 'syntax.md'),
      `---
kind: broken
indexedFields: [unterminated
---
## Frontmatter
\`\`\`yaml
title: { type: string, required: true }
\`\`\`
`,
    );

    const reg = await KindRegistry.load(dir);
    expect(reg.list().map((k) => k.kind)).toEqual(['task']);
    expect(reg.issues).toHaveLength(1);
    expect(reg.issues[0].file).toMatch(/syntax\.md$/);
  });
});
