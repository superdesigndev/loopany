import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SearchStore,
  chunkMarkdown,
  sanitizeFtsQuery,
  reciprocalRankFusion,
} from '../src/core/search-store.ts';
import { NoopEmbedder, cosineSimilarity } from '../src/core/embedder.ts';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('chunkMarkdown', () => {
  test('splits on ## and ### headings', () => {
    const chunks = chunkMarkdown(
      '## First\nalpha\n\n## Second\nbeta\n\n### Nested\ngamma',
    );
    expect(chunks).toEqual([
      { section: 'First', content: 'alpha' },
      { section: 'Second', content: 'beta' },
      { section: 'Nested', content: 'gamma' },
    ]);
  });

  test('content before first heading becomes an unnamed chunk', () => {
    const chunks = chunkMarkdown('preamble text\n\n## Body\nmain');
    expect(chunks).toEqual([
      { section: null, content: 'preamble text' },
      { section: 'Body', content: 'main' },
    ]);
  });

  test('empty sections are dropped', () => {
    const chunks = chunkMarkdown('## Empty\n\n## Has\ncontent');
    expect(chunks).toEqual([{ section: 'Has', content: 'content' }]);
  });

  test('ignores top-level # heading (treated as body text)', () => {
    // The chunker only splits on ## / ### — top-level # is preserved as
    // body text. Keeps loopany's artifact title convention from fighting
    // with section splitting.
    const chunks = chunkMarkdown('# Title\nbody here');
    expect(chunks).toEqual([{ section: null, content: '# Title\nbody here' }]);
  });
});

describe('sanitizeFtsQuery', () => {
  test('strips punctuation and joins with OR', () => {
    expect(sanitizeFtsQuery('hello, world!')).toBe('hello OR world');
  });

  test('drops tokens shorter than 2 chars', () => {
    expect(sanitizeFtsQuery('a hello b world')).toBe('hello OR world');
  });

  test('returns empty string when nothing usable remains', () => {
    expect(sanitizeFtsQuery('!!!')).toBe('');
    expect(sanitizeFtsQuery('a b c')).toBe('');
  });
});

describe('reciprocalRankFusion', () => {
  const mkRow = (id: number) => ({
    id,
    data: {
      id,
      artifact_id: `a${id}`,
      kind: 'note',
      domain: null,
      status: null,
      path: `/p/${id}`,
      section: null,
      content: `c${id}`,
    },
  });

  test('single result set = plain RRF scores', () => {
    const fused = reciprocalRankFusion([[mkRow(1), mkRow(2)]]);
    expect(fused.get(1)!.score).toBeCloseTo(1 / 61);
    expect(fused.get(2)!.score).toBeCloseTo(1 / 62);
  });

  test('overlapping sets add up', () => {
    // id=1 is rank 0 in both sets → 2 * 1/61
    const fused = reciprocalRankFusion([[mkRow(1), mkRow(2)], [mkRow(1)]]);
    expect(fused.get(1)!.score).toBeCloseTo(2 / 61);
    expect(fused.get(2)!.score).toBeCloseTo(1 / 62);
  });
});

describe('cosineSimilarity', () => {
  test('identical normalized vectors → 1.0', () => {
    const v = new Float32Array([0.6, 0.8]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  test('orthogonal vectors → 0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SearchStore (integration, NoopEmbedder)
// ---------------------------------------------------------------------------

describe('SearchStore', () => {
  let dbPath: string;
  let tmpDir: string;
  let store: SearchStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loopany-store-'));
    dbPath = join(tmpDir, 'search.db');
    store = new SearchStore(dbPath, new NoopEmbedder());
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseArtifact = (overrides: Partial<Parameters<SearchStore['indexArtifact']>[0]> = {}) => ({
    id: 'nte-alpha',
    kind: 'note',
    domain: 'test',
    status: null,
    path: '/tmp/alpha.md',
    mtime: 1,
    title: 'Alpha Title',
    body: '## Intro\nsome introductory text here\n\n## Body\nmain body lorem ipsum',
    ...overrides,
  });

  test('indexArtifact + FTS-only search returns title-matched chunk', async () => {
    await store.indexArtifact(baseArtifact());
    const results = await store.search('alpha');
    expect(results).toHaveLength(1);
    expect(results[0].artifactId).toBe('nte-alpha');
    // Title chunk wins because the term is literal in the title.
    expect(results[0].section).toBe('Title');
  });

  test('body section chunks are searchable', async () => {
    await store.indexArtifact(baseArtifact());
    const results = await store.search('lorem ipsum');
    expect(results).toHaveLength(1);
    expect(results[0].section).toBe('Body');
  });

  test('filter by kind excludes non-matching artifacts', async () => {
    await store.indexArtifact(baseArtifact());
    await store.indexArtifact({
      ...baseArtifact({
        id: 'tsk-beta',
        kind: 'task',
        path: '/tmp/beta.md',
        title: 'Alpha Task',
        body: 'alpha task body',
      }),
    });

    const notes = await store.search('alpha', { kind: 'note' });
    expect(notes.map((r) => r.artifactId)).toEqual(['nte-alpha']);

    const tasks = await store.search('alpha', { kind: 'task' });
    expect(tasks.map((r) => r.artifactId)).toEqual(['tsk-beta']);
  });

  test('filter by domain and status', async () => {
    await store.indexArtifact(baseArtifact({ id: 'a1', domain: 'x', status: 'done', title: 'one' }));
    await store.indexArtifact(baseArtifact({ id: 'a2', domain: 'x', status: 'running', title: 'two' }));
    await store.indexArtifact(baseArtifact({ id: 'a3', domain: 'y', status: 'done', title: 'three' }));

    const done_x = await store.search('Intro', { domain: 'x', status: 'done' });
    expect(done_x.map((r) => r.artifactId)).toEqual(['a1']);
  });

  test('needsIndex tracks mtime per artifact', async () => {
    expect(store.needsIndex('nte-alpha', 1)).toBe(true);
    await store.indexArtifact(baseArtifact({ mtime: 1 }));
    expect(store.needsIndex('nte-alpha', 1)).toBe(false);
    expect(store.needsIndex('nte-alpha', 2)).toBe(true);
  });

  test('re-indexing the same artifact replaces its chunks', async () => {
    await store.indexArtifact(baseArtifact({ body: '## A\nfirst version' }));
    let r = await store.search('first');
    expect(r).toHaveLength(1);

    await store.indexArtifact(baseArtifact({ mtime: 2, body: '## B\nsecond version' }));
    r = await store.search('first');
    expect(r).toHaveLength(0);
    r = await store.search('second');
    expect(r).toHaveLength(1);
  });

  test('removeArtifact drops chunks and mtime', async () => {
    await store.indexArtifact(baseArtifact());
    expect(store.knownArtifactIds()).toEqual(new Set(['nte-alpha']));
    store.removeArtifact('nte-alpha');
    expect(store.knownArtifactIds().size).toBe(0);
    const r = await store.search('alpha');
    expect(r).toHaveLength(0);
  });

  test('one artifact returns once even when multiple chunks match', async () => {
    await store.indexArtifact(
      baseArtifact({
        body: '## One\nlorem lorem\n\n## Two\nlorem again',
      }),
    );
    const r = await store.search('lorem');
    expect(r).toHaveLength(1);
    expect(r[0].artifactId).toBe('nte-alpha');
  });

  test('sanitized-empty query returns no results (no crash)', async () => {
    await store.indexArtifact(baseArtifact());
    const r = await store.search('!!!');
    expect(r).toEqual([]);
  });
});
