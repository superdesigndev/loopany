// Builds the JSON payload the factory UI renders.
// Shape: {nodes, edges, lanes, domains, enabledDomains, workspace}.
//
// Nodes carry just enough for a card + hover preview — NOT the full body.
// Edges include both explicit references.jsonl rows and implicit edges
// promoted from frontmatter.mentions / body [[links]].

import { statSync } from 'fs';
import type { Engine } from '../core/engine.ts';

export interface GraphNode {
  id: string;
  kind: string;
  title: string;
  status: string | null;
  domain: string | null;
  path: string;
  preview: string;
  createdAt: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  implicit: boolean;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: string[];
  domains: string[];
  enabledDomains: string[];
  workspace: string;
}

// Default vertical stacking for kinds. Unknown kinds land in the last lane.
const DEFAULT_LANE_ORDER = [
  'goal',
  'signal',
  'task',
  'brief',
  'learning',
  'skill-proposal',
  'person',
];

export async function buildGraph(engine: Engine): Promise<GraphPayload> {
  const [artifacts, index] = await Promise.all([
    engine.store.listAll(),
    engine.index(),
  ]);

  const nodes: GraphNode[] = artifacts.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: pickTitle(a.frontmatter, a.id),
    status: typeof a.frontmatter.status === 'string' ? a.frontmatter.status : null,
    domain: typeof a.frontmatter.domain === 'string' ? a.frontmatter.domain : null,
    path: a.path,
    preview: firstLines(a.body, 5),
    createdAt: extractCreatedAt(a.id, a.path),
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    for (const e of index.refsOut(node.id)) {
      if (!nodeIds.has(e.to)) continue; // skip orphan refs
      const key = `${e.from}|${e.to}|${e.relation}|${e.implicit ? 'i' : 'e'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: e.from,
        to: e.to,
        relation: e.relation,
        implicit: !!e.implicit,
      });
    }
  }

  const kindsPresent = new Set(nodes.map((n) => n.kind));
  const lanes = [
    ...DEFAULT_LANE_ORDER.filter((k) => kindsPresent.has(k)),
    ...[...kindsPresent].filter((k) => !DEFAULT_LANE_ORDER.includes(k)).sort(),
  ];

  const domains = [
    ...new Set(nodes.map((n) => n.domain).filter((d): d is string => !!d)),
  ].sort();

  return {
    nodes,
    edges,
    lanes,
    domains,
    enabledDomains: engine.config.enabledDomains(),
    workspace: engine.root,
  };
}

// Different kinds carry their display label under different keys:
//   task / brief / goal / learning / note / skill-proposal → `title`
//   signal → `summary`
//   person → `name`
// Fall through in that priority; only then back off to the id.
function pickTitle(fm: Record<string, unknown>, fallback: string): string {
  for (const key of ['title', 'summary', 'name']) {
    const v = fm[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return fallback;
}

function firstLines(body: string, n: number): string {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.slice(0, n).join('\n');
}

function extractCreatedAt(id: string, path: string): string {
  const m = id.match(/-(\d{8})-(\d{6})/);
  if (m) {
    const d = m[1];
    const t = m[2];
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  }
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
