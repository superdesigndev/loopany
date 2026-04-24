import { describe, expect, test } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { runCli, newWorkspace } from './helpers/cli.ts';

// All CLI search tests run with --no-embed so the suite doesn't need to
// download the ONNX model or load transformers on every run. Semantic
// behavior is covered by the SearchStore unit tests using TransformersEmbedder
// is exercised at the integration level in a separate opt-in suite if we
// ever want it.

async function setupWorkspaceWithNotes(): Promise<string> {
  const ws = newWorkspace();
  await runCli(ws, 'init');
  await runCli(
    ws,
    'artifact',
    'create',
    '--kind', 'note',
    '--slug', 'search-design',
    '--title', 'search design',
    '--content', '## Approach\nEvaluate hybrid retrieval with FTS5 and MiniLM.',
  );
  await runCli(
    ws,
    'artifact',
    'create',
    '--kind', 'note',
    '--slug', 'billing-refactor',
    '--title', 'refactor billing loop',
    '--content', 'Move billing calculation out of the tenant iteration loop.',
  );
  return ws;
}

describe('search + reindex CLI', () => {
  test('search before reindex returns empty and warns on stderr', async () => {
    const ws = await setupWorkspaceWithNotes();
    const r = await runCli(ws, 'search', 'anything');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
    expect(r.stderr).toContain('no search index found');
  });

  test('reindex --no-embed populates the index and is idempotent', async () => {
    const ws = await setupWorkspaceWithNotes();

    const first = await runCli(ws, 'reindex', '--no-embed');
    expect(first.code).toBe(0);
    const firstResult = JSON.parse(first.stdout);
    expect(firstResult.indexed).toBe(2);
    expect(firstResult.skipped).toBe(0);
    expect(firstResult.embedder).toBe('noop');
    expect(existsSync(join(ws, 'search.db'))).toBe(true);

    const second = await runCli(ws, 'reindex', '--no-embed');
    const secondResult = JSON.parse(second.stdout);
    expect(secondResult.indexed).toBe(0);
    expect(secondResult.skipped).toBe(2);
  });

  test('search returns structured results', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');

    const r = await runCli(ws, 'search', 'billing');
    expect(r.code).toBe(0);
    const results = JSON.parse(r.stdout);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      artifactId: 'nte-billing-refactor',
      kind: 'note',
    });
    expect(typeof results[0].score).toBe('number');
    expect(results[0].path).toContain('nte-billing-refactor.md');
  });

  test('search with --kind filter', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');

    const notes = await runCli(ws, 'search', 'billing', '--kind', 'note');
    expect(JSON.parse(notes.stdout)).toHaveLength(1);

    const tasks = await runCli(ws, 'search', 'billing', '--kind', 'task');
    expect(JSON.parse(tasks.stdout)).toEqual([]);
  });

  test('search with --limit caps results', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');

    // Both notes have no shared keyword with "loop" except one — force a
    // broader query that hits both and check the cap.
    const r = await runCli(ws, 'search', 'billing loop', '--limit', '1');
    const results = JSON.parse(r.stdout);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('reindex detects deleted artifacts and removes them', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');

    // Remove one artifact from disk
    const { rmSync } = await import('fs');
    rmSync(join(ws, 'artifacts', 'notes', 'nte-billing-refactor.md'));

    const r = await runCli(ws, 'reindex', '--no-embed');
    const result = JSON.parse(r.stdout);
    expect(result.removed).toBe(1);
    expect(result.indexed).toBe(0);

    const search = await runCli(ws, 'search', 'billing');
    expect(JSON.parse(search.stdout)).toEqual([]);
  });

  test('search with no query returns a usage error', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');
    const r = await runCli(ws, 'search');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Usage');
  });

  test('reindex --force rebuilds from scratch', async () => {
    const ws = await setupWorkspaceWithNotes();
    await runCli(ws, 'reindex', '--no-embed');
    const r = await runCli(ws, 'reindex', '--no-embed', '--force');
    const result = JSON.parse(r.stdout);
    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(0);
  });
});
