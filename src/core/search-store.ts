// Hybrid semantic + keyword search index over loopany artifacts.
//
// Storage: bun:sqlite file at $LOOPANY_HOME/search.db. Markdown remains the
// source of truth; this DB is a derived index and can be safely deleted and
// rebuilt from artifacts via reindex.
//
// Retrieval: FTS5 (BM25) + vector cosine fused by Reciprocal Rank Fusion.
// When the embedder is unavailable, degrades cleanly to FTS5-only.
//
// Scope: deliberately smaller than a full memory store. No lifecycle,
// confidence decay, upsert-with-dedup, scopes, or consolidation — artifacts
// have stable IDs and explicit lifecycles via frontmatter.

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  cosineSimilarity,
  embeddingToBuffer,
  bufferToEmbedding,
  type Embedder,
} from './embedder.ts';

const SCHEMA_VERSION = 1;
const SEMANTIC_MIN_THRESHOLD = 0.3;
const RRF_K = 60;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS artifact_chunks (
  id INTEGER PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  domain TEXT,
  status TEXT,
  path TEXT NOT NULL,
  section TEXT,
  content TEXT NOT NULL,
  embedding BLOB,
  indexed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_artifact ON artifact_chunks(artifact_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kind ON artifact_chunks(kind);
CREATE INDEX IF NOT EXISTS idx_chunks_domain ON artifact_chunks(domain);
CREATE INDEX IF NOT EXISTS idx_chunks_status ON artifact_chunks(status);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content, section,
  content='artifact_chunks', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON artifact_chunks BEGIN
  INSERT INTO chunks_fts(rowid, content, section) VALUES (new.id, new.content, new.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON artifact_chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, section) VALUES('delete', old.id, old.content, old.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON artifact_chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, section) VALUES('delete', old.id, old.content, old.section);
  INSERT INTO chunks_fts(rowid, content, section) VALUES (new.id, new.content, new.section);
END;

CREATE TABLE IF NOT EXISTS artifact_mtimes (
  artifact_id TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
`;

export interface ArtifactInput {
  id: string;
  kind: string;
  domain?: string | null;
  status?: string | null;
  path: string;
  mtime: number;
  /** Optional human-readable title; indexed as its own chunk if present. */
  title?: string | null;
  /** Markdown body (frontmatter already stripped). */
  body: string;
}

export interface SearchOptions {
  kind?: string;
  domain?: string;
  status?: string;
  limit?: number;
}

export interface SearchResult {
  artifactId: string;
  kind: string;
  domain: string | null;
  status: string | null;
  path: string;
  section: string | null;
  snippet: string;
  score: number;
}

/**
 * Split markdown body into chunks at `##` / `###` headings.
 * Empty sections are dropped. Text before the first heading becomes an
 * unnamed chunk (section: null). Exported for tests.
 */
export function chunkMarkdown(
  body: string,
): Array<{ section: string | null; content: string }> {
  const lines = body.split('\n');
  const chunks: Array<{ section: string | null; content: string }> = [];
  let section: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) chunks.push({ section, content: text });
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      flush();
      section = m[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

/**
 * Sanitize a user query for FTS5 MATCH. Strips punctuation, drops tokens
 * shorter than 2 chars, joins with OR. Returns '' if nothing remains —
 * callers treat that as "no FTS hit".
 */
export function sanitizeFtsQuery(q: string): string {
  const words = q
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length === 0) return '';
  return words.join(' OR ');
}

interface ChunkRow {
  id: number;
  artifact_id: string;
  kind: string;
  domain: string | null;
  status: string | null;
  path: string;
  section: string | null;
  content: string;
}

interface RankedSet {
  id: number;
  data: ChunkRow;
}

/**
 * Combine ranked lists by Reciprocal Rank Fusion. Exported for tests.
 * Score = Σ 1 / (k + rank + 1). k = 60 is the standard.
 */
export function reciprocalRankFusion(
  sets: Array<RankedSet[]>,
): Map<number, { score: number; data: ChunkRow }> {
  const fused = new Map<number, { score: number; data: ChunkRow }>();
  for (const set of sets) {
    for (let i = 0; i < set.length; i++) {
      const { id, data } = set[i];
      const existing = fused.get(id) ?? { score: 0, data };
      existing.score += 1 / (RRF_K + i + 1);
      fused.set(id, existing);
    }
  }
  return fused;
}

export class SearchStore {
  private db: Database;

  constructor(
    dbPath: string,
    private embedder: Embedder,
  ) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
    this.migrate();
  }

  private migrate(): void {
    const row = this.db
      .prepare('SELECT MAX(version) as v FROM schema_version')
      .get() as { v: number | null } | undefined;
    if ((row?.v ?? 0) < SCHEMA_VERSION) {
      this.db
        .prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)')
        .run(SCHEMA_VERSION);
    }
  }

  close(): void {
    this.db.close();
  }

  /**
   * Whether an artifact's mtime matches what we have indexed. Callers use
   * this to decide whether to skip reindexing a file.
   */
  needsIndex(id: string, mtime: number): boolean {
    const row = this.db
      .prepare('SELECT mtime FROM artifact_mtimes WHERE artifact_id = ?')
      .get(id) as { mtime: number } | undefined;
    return !row || row.mtime !== mtime;
  }

  /** Return the set of artifact IDs currently indexed. */
  knownArtifactIds(): Set<string> {
    const rows = this.db
      .prepare('SELECT artifact_id FROM artifact_mtimes')
      .all() as Array<{ artifact_id: string }>;
    return new Set(rows.map((r) => r.artifact_id));
  }

  /** Delete all chunks for an artifact (used when the file disappears). */
  removeArtifact(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM artifact_chunks WHERE artifact_id = ?').run(id);
      this.db.prepare('DELETE FROM artifact_mtimes WHERE artifact_id = ?').run(id);
    });
    tx();
  }

  /**
   * Full replace: drop any existing chunks for this artifact, then re-chunk
   * and re-embed from scratch. Embeddings are only written when the embedder
   * is available; otherwise the chunk is FTS-only.
   */
  async indexArtifact(a: ArtifactInput): Promise<void> {
    const chunks = this.buildChunks(a);
    const now = Date.now();

    // Embed before opening the DB transaction — embedding is async and
    // bun:sqlite transactions must be synchronous.
    const embeddings: Array<Float32Array | null> = [];
    for (const c of chunks) {
      if (this.embedder.isAvailable()) {
        try {
          embeddings.push(await this.embedder.embed(c.content));
        } catch {
          embeddings.push(null);
        }
      } else {
        embeddings.push(null);
      }
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM artifact_chunks WHERE artifact_id = ?')
        .run(a.id);

      const insert = this.db.prepare(
        `INSERT INTO artifact_chunks
         (artifact_id, kind, domain, status, path, section, content, embedding, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const e = embeddings[i];
        insert.run(
          a.id,
          a.kind,
          a.domain ?? null,
          a.status ?? null,
          a.path,
          c.section,
          c.content,
          e ? embeddingToBuffer(e) : null,
          now,
        );
      }

      this.db
        .prepare(
          'INSERT OR REPLACE INTO artifact_mtimes (artifact_id, mtime) VALUES (?, ?)',
        )
        .run(a.id, a.mtime);
    });
    tx();
  }

  /**
   * Split an artifact into chunks. The title (if any) becomes its own chunk
   * so purely title-relevant artifacts surface even when the body has no
   * matching text.
   */
  private buildChunks(a: ArtifactInput): Array<{ section: string | null; content: string }> {
    const chunks: Array<{ section: string | null; content: string }> = [];
    if (a.title && a.title.trim()) {
      chunks.push({ section: 'Title', content: a.title.trim() });
    }
    for (const c of chunkMarkdown(a.body)) chunks.push(c);
    return chunks;
  }

  /**
   * Hybrid search: FTS5 + vector cosine, fused via RRF, grouped by artifact
   * (best-scoring chunk per artifact wins). Returns top `limit` results
   * ordered by fused score.
   */
  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    const limit = opts?.limit ?? 10;
    const fetchLimit = limit * 3;

    const keywordResults = this.keywordSearch(query, opts, fetchLimit);
    const semanticResults = this.embedder.isAvailable()
      ? await this.semanticSearch(query, opts, fetchLimit)
      : [];

    const fused = reciprocalRankFusion([
      keywordResults.map((r) => ({ id: r.id, data: r })),
      semanticResults.map((r) => ({ id: r.id, data: r })),
    ]);

    // Group by artifact_id — keep the best-scoring chunk for each artifact.
    const bestByArtifact = new Map<string, { score: number; data: ChunkRow }>();
    for (const entry of fused.values()) {
      const existing = bestByArtifact.get(entry.data.artifact_id);
      if (!existing || entry.score > existing.score) {
        bestByArtifact.set(entry.data.artifact_id, entry);
      }
    }

    return [...bestByArtifact.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((e) => ({
        artifactId: e.data.artifact_id,
        kind: e.data.kind,
        domain: e.data.domain,
        status: e.data.status,
        path: e.data.path,
        section: e.data.section,
        snippet: truncate(e.data.content, 200),
        score: e.score,
      }));
  }

  private keywordSearch(
    query: string,
    opts: SearchOptions | undefined,
    limit: number,
  ): ChunkRow[] {
    const clean = sanitizeFtsQuery(query);
    if (!clean) return [];

    const { clause, params } = buildFilterClause(opts);
    const sql = `
      SELECT c.id, c.artifact_id, c.kind, c.domain, c.status, c.path,
             c.section, c.content
      FROM chunks_fts
      JOIN artifact_chunks c ON c.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ? ${clause}
      ORDER BY rank LIMIT ?
    `;
    try {
      return this.db.prepare(sql).all(clean, ...params, limit) as ChunkRow[];
    } catch {
      return [];
    }
  }

  private async semanticSearch(
    query: string,
    opts: SearchOptions | undefined,
    limit: number,
  ): Promise<ChunkRow[]> {
    const qEmb = await this.embedder.embed(query);
    const { clause, params } = buildFilterClause(opts);
    const sql = `
      SELECT c.id, c.artifact_id, c.kind, c.domain, c.status, c.path,
             c.section, c.content, c.embedding
      FROM artifact_chunks c
      WHERE c.embedding IS NOT NULL ${clause}
    `;
    const rows = this.db.prepare(sql).all(...params) as Array<
      ChunkRow & { embedding: Uint8Array }
    >;

    return rows
      .map((r) => ({
        row: r,
        sim: cosineSimilarity(qEmb, bufferToEmbedding(r.embedding)),
      }))
      .filter((x) => x.sim >= SEMANTIC_MIN_THRESHOLD)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map(({ row }) => {
        const { embedding: _e, ...rest } = row;
        return rest;
      });
  }
}

function buildFilterClause(opts?: SearchOptions): {
  clause: string;
  params: string[];
} {
  const parts: string[] = [];
  const params: string[] = [];
  if (opts?.kind) {
    parts.push('AND c.kind = ?');
    params.push(opts.kind);
  }
  if (opts?.domain) {
    parts.push('AND c.domain = ?');
    params.push(opts.domain);
  }
  if (opts?.status) {
    parts.push('AND c.status = ?');
    params.push(opts.status);
  }
  return {
    clause: parts.join(' '),
    params,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
