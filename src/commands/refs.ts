// `loopany refs <id> [--direction in|out|both] [--relation R] [--depth N]`
// `loopany refs add --from <id> --to <id> --relation <R>`

import type { Engine } from '../core/engine.ts';
import type { ArtifactIndex } from '../core/index.ts';
import type { Edge } from '../core/references.ts';
import { parseArgs } from './argv.ts';

type Direction = 'in' | 'out' | 'both';

export async function runRefsAdd(engine: Engine, args: string[]): Promise<Edge> {
  const { flags } = parseArgs(args);
  if (!flags.from || !flags.to || !flags.relation) {
    throw new Error('refs add requires --from, --to, --relation');
  }
  return engine.refs.append({
    from: flags.from,
    to: flags.to,
    relation: flags.relation,
    actor: 'cli',
  });
}

export async function runRefsQuery(engine: Engine, args: string[]): Promise<Edge[]> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    throw new Error('Usage: refs <id> [--direction in|out|both] [--relation R] [--depth N]');
  }

  const direction = (flags.direction ?? 'out') as Direction;
  const depth = flags.depth ? parseDepth(flags.depth) : 1;
  const idx = await engine.index();

  return traverse(idx, id, {
    direction,
    depth,
    relation: flags.relation,
    domain: flags.domain,
  });
}

interface TraverseOptions {
  direction: Direction;
  depth: number;
  relation?: string;
  domain?: string;
}

// BFS over the in-memory graph. Visited tracks nodes (not edges) so we don't
// re-expand a node, but every unique edge encountered along the way is
// returned — the caller reconstructs paths from from/to. Depth N means up to
// N hops; depth 1 is identical to the previous one-hop behavior.
function traverse(idx: ArtifactIndex, startId: string, opts: TraverseOptions): Edge[] {
  const visited = new Set<string>([startId]);
  const seenEdge = new Set<string>();
  const out: Edge[] = [];

  let frontier: string[] = [startId];
  for (let d = 0; d < opts.depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      const edges = edgesAt(idx, node, opts.direction);
      for (const e of edges) {
        if (opts.relation && e.relation !== opts.relation) continue;
        if (opts.domain && !edgeInDomain(idx, e, opts.domain)) continue;

        const key = `${e.from}|${e.to}|${e.relation}|${e.ts}`;
        if (!seenEdge.has(key)) {
          seenEdge.add(key);
          out.push(e);
        }

        const other = e.from === node ? e.to : e.from;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return out;
}

function edgesAt(idx: ArtifactIndex, node: string, direction: Direction): Edge[] {
  if (direction === 'out') return idx.refsOut(node);
  if (direction === 'in') return idx.refsIn(node);
  return [...idx.refsOut(node), ...idx.refsIn(node)];
}

function edgeInDomain(idx: ArtifactIndex, e: Edge, domain: string): boolean {
  const from = idx.byId(e.from);
  const to = idx.byId(e.to);
  return from?.frontmatter.domain === domain && to?.frontmatter.domain === domain;
}

function parseDepth(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid --depth: ${s} (expected positive integer)`);
  }
  return n;
}
