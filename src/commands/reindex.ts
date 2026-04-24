// `loopany reindex [--force]` — rebuild the search index from artifacts/.
//
// Incremental: skips artifacts whose file mtime matches what's already in
// search.db. --force re-embeds every artifact from scratch.
//
// This command is the only safe way to populate search.db after a bulk edit
// or model change. Artifact creates/appends/statuses don't auto-reindex in
// v1 — they're per-artifact operations and the cost of an embed on every
// write would be surprising. Run reindex whenever you want to refresh.

import { statSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { Engine } from '../core/engine.ts';
import {
  SearchStore,
  type ArtifactInput,
} from '../core/search-store.ts';
import {
  TransformersEmbedder,
  NoopEmbedder,
  type Embedder,
} from '../core/embedder.ts';

export interface ReindexResult {
  indexed: number;
  skipped: number;
  removed: number;
  embedder: 'transformers' | 'noop';
}

export async function runReindex(
  engine: Engine,
  args: string[],
): Promise<ReindexResult> {
  const force = args.includes('--force');
  const noEmbed = args.includes('--no-embed');

  const dbPath = join(engine.root, 'search.db');
  if (force && existsSync(dbPath)) {
    // Fully recreate the DB on --force. Safer than relying on DELETE across
    // all tables, and it also rebuilds the FTS5 index cleanly.
    rmSync(dbPath);
  }

  const embedder: Embedder = noEmbed ? new NoopEmbedder() : new TransformersEmbedder();
  // Pre-warm so the first indexArtifact call doesn't include the ~4s load
  // cost in a per-artifact timer a user might watch. Errors are caught
  // inside ready() and surface via isAvailable() === false.
  await embedder.ready();

  const store = new SearchStore(dbPath, embedder);

  try {
    const artifacts = await engine.store.listAll();
    const seen = new Set<string>();
    let indexed = 0;
    let skipped = 0;

    for (const a of artifacts) {
      seen.add(a.id);
      const mtime = Math.floor(statMtime(a.path));
      if (!force && !store.needsIndex(a.id, mtime)) {
        skipped++;
        continue;
      }
      const input: ArtifactInput = {
        id: a.id,
        kind: a.kind,
        domain: stringField(a.frontmatter.domain),
        status: stringField(a.frontmatter.status),
        path: a.path,
        mtime,
        title: stringField(a.frontmatter.title),
        body: a.body,
      };
      await store.indexArtifact(input);
      indexed++;
    }

    // Remove artifacts that no longer exist on disk.
    let removed = 0;
    for (const id of store.knownArtifactIds()) {
      if (!seen.has(id)) {
        store.removeArtifact(id);
        removed++;
      }
    }

    return {
      indexed,
      skipped,
      removed,
      embedder: embedder.isAvailable() ? 'transformers' : 'noop',
    };
  } finally {
    store.close();
  }
}

function statMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function stringField(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
