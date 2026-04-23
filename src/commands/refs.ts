// `loopany refs <id> [--direction in|out|both] [--relation R]`
// `loopany refs add --from <id> --to <id> --relation <R>`

import type { Engine } from '../core/engine.ts';
import type { Edge } from '../core/references.ts';
import { parseArgs } from './argv.ts';

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
  if (!id) throw new Error('Usage: refs <id> [--direction in|out|both] [--relation R]');

  const direction = (flags.direction ?? 'out') as 'in' | 'out' | 'both';
  const idx = await engine.index();

  let edges: Edge[];
  if (direction === 'out') edges = idx.refsOut(id);
  else if (direction === 'in') edges = idx.refsIn(id);
  else edges = [...idx.refsOut(id), ...idx.refsIn(id)];

  if (flags.relation) {
    edges = edges.filter((e) => e.relation === flags.relation);
  }
  if (flags.domain) {
    // Keep edges where both endpoints are in this domain (or endpoint unknown = drop).
    edges = edges.filter((e) => {
      const from = idx.byId(e.from);
      const to = idx.byId(e.to);
      return from?.frontmatter.domain === flags.domain && to?.frontmatter.domain === flags.domain;
    });
  }
  return edges;
}
