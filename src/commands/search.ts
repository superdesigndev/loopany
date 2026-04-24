// `loopany search <query> [--kind K] [--domain D] [--status S] [--limit N]`
// Hybrid keyword + semantic search over artifact bodies and titles.
//
// Requires that `loopany reindex` has been run at least once to populate
// search.db. If the DB is missing, returns an empty result with an
// explanatory message on stderr — not a hard error, so scripts can probe.

import { existsSync } from 'fs';
import { join } from 'path';
import type { Engine } from '../core/engine.ts';
import { SearchStore, type SearchResult } from '../core/search-store.ts';
import { TransformersEmbedder } from '../core/embedder.ts';
import { parseArgs } from './argv.ts';

export async function runSearch(
  engine: Engine,
  args: string[],
): Promise<SearchResult[]> {
  // Split off boolean-ish flags (none right now) before parseArgs, which
  // requires every flag to take a value.
  const { positional, flags } = parseArgs(args);

  if (positional.length === 0) {
    throw new Error('Usage: loopany search <query> [--kind K] [--domain D] [--status S] [--limit N]');
  }
  const query = positional.join(' ');

  const dbPath = join(engine.root, 'search.db');
  if (!existsSync(dbPath)) {
    process.stderr.write(
      'loopany: no search index found — run `loopany reindex` first.\n',
    );
    return [];
  }

  const limit = flags.limit ? parsePositiveInt(flags.limit, 'limit') : 10;
  const store = new SearchStore(dbPath, new TransformersEmbedder());
  try {
    return await store.search(query, {
      kind: flags.kind,
      domain: flags.domain,
      status: flags.status,
      limit,
    });
  } finally {
    store.close();
  }
}

function parsePositiveInt(s: string, name: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid --${name}: ${s} (expected positive integer)`);
  }
  return n;
}
