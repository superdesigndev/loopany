// `loopany trace <id> [--direction forward|backward|both] [--relations csv] [--max-depth N]`
//
// Walk causal / lineage predicates from <id> to fixed point. The default
// predicate set is the canonical causal-and-evidence verbs from
// skills/relations/SKILL.md: led-to, addresses, supersedes,
// follows-up, cites. mentions is excluded — it's a soft pointer, not
// lineage. caused-by is excluded too; CLAUDE.md prefers led-to and
// expects callers to use --direction backward to reach causes.
//
// Output:
//   { root, nodes: [{ ...meta, distance }], edges: Edge[] }
// distance is signed: negative for backward (causes), 0 for the root,
// positive for forward (effects). Sort order is by distance, so the
// returned array reads top-to-bottom as cause → root → effect.

import type { Engine } from '../core/engine.ts';
import type { ArtifactIndex, ArtifactMeta } from '../core/index.ts';
import type { Edge } from '../core/references.ts';
import { parseArgs } from './argv.ts';

type Direction = 'forward' | 'backward' | 'both';

const DEFAULT_RELATIONS = ['led-to', 'addresses', 'supersedes', 'follows-up', 'cites'];

export interface TraceNode extends ArtifactMeta {
  distance: number;
}

export interface TraceResult {
  root: string;
  nodes: TraceNode[];
  edges: Edge[];
}

export async function runTrace(engine: Engine, args: string[]): Promise<TraceResult> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    throw new Error(
      'Usage: trace <id> [--direction forward|backward|both] [--relations csv] [--max-depth N]',
    );
  }

  const direction = (flags.direction ?? 'both') as Direction;
  if (direction !== 'forward' && direction !== 'backward' && direction !== 'both') {
    throw new Error(`Invalid --direction: ${flags.direction} (expected forward|backward|both)`);
  }

  const relations = flags.relations
    ? flags.relations.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_RELATIONS;
  if (relations.length === 0) {
    throw new Error('Invalid --relations: must list at least one relation');
  }

  const maxDepth = flags['max-depth']
    ? parsePositive(flags['max-depth'], 'max-depth')
    : Infinity;

  const idx = await engine.index();
  const root = idx.byId(id);
  if (!root) {
    throw new Error(`No artifact with id: ${id}`);
  }

  const nodesByDist = new Map<string, number>([[id, 0]]);
  const edges: Edge[] = [];
  const seenEdge = new Set<string>();
  const relSet = new Set(relations);

  if (direction === 'forward' || direction === 'both') {
    walk(idx, id, +1, relSet, maxDepth, nodesByDist, edges, seenEdge);
  }
  if (direction === 'backward' || direction === 'both') {
    walk(idx, id, -1, relSet, maxDepth, nodesByDist, edges, seenEdge);
  }

  const nodes: TraceNode[] = [];
  for (const [nodeId, dist] of nodesByDist) {
    const meta = idx.byId(nodeId);
    if (!meta) continue; // dangling edge target — drop from output
    nodes.push({ ...meta, distance: dist });
  }
  nodes.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));

  return { root: id, nodes, edges };
}

function walk(
  idx: ArtifactIndex,
  start: string,
  sign: 1 | -1,
  relSet: Set<string>,
  maxDepth: number,
  nodesByDist: Map<string, number>,
  edges: Edge[],
  seenEdge: Set<string>,
): void {
  let frontier = [start];
  for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      const candidates = sign > 0 ? idx.refsOut(node) : idx.refsIn(node);
      for (const e of candidates) {
        if (!relSet.has(e.relation)) continue;
        const key = `${e.from}|${e.to}|${e.relation}|${e.ts}`;
        if (!seenEdge.has(key)) {
          seenEdge.add(key);
          edges.push(e);
        }
        const other = sign > 0 ? e.to : e.from;
        if (!nodesByDist.has(other)) {
          nodesByDist.set(other, sign * d);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
}

function parsePositive(s: string, name: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid --${name}: ${s} (expected positive integer)`);
  }
  return n;
}
