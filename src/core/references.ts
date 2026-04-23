// Append-only graph in loopany/references.jsonl.
// One row per edge — reverse edges are NOT stored; built in memory at load time.
//
// Row shape:
//   {"ts":"...","from":"<id>","to":"<id>","relation":"<verb>","actor":"agent|cli"}
//
// `relation` is an open registry. Convention (lives in skills/, not code):
// prefer "led-to" over "caused-by"; query direction handles the other side.

import { appendFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface EdgeInput {
  from: string;
  to: string;
  relation: string;
  actor: string;
}

export interface Edge extends EdgeInput {
  ts: string;
  /**
   * True when the edge was inferred at index-build time from an artifact's
   * frontmatter (e.g. `mentions: [...]`) rather than persisted in
   * references.jsonl. Implicit edges are read-only via query; they change
   * only when the source artifact's frontmatter changes.
   */
  implicit?: boolean;
}

export interface LoadedGraph {
  forward: Map<string, Edge[]>;
  reverse: Map<string, Edge[]>;
}

export class ReferenceGraph {
  constructor(private path: string) {}

  async append(edge: EdgeInput): Promise<Edge> {
    const ts = new Date().toISOString();
    const row: Edge = { ts, ...edge };
    await appendFile(this.path, JSON.stringify(row) + '\n', 'utf-8');
    return row;
  }

  async load(): Promise<LoadedGraph> {
    const forward = new Map<string, Edge[]>();
    const reverse = new Map<string, Edge[]>();

    if (!existsSync(this.path)) {
      return { forward, reverse };
    }

    const content = await readFile(this.path, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let row: Edge;
      try {
        row = JSON.parse(line);
      } catch {
        continue; // skip malformed
      }
      if (!row.from || !row.to || !row.relation) continue;

      pushTo(forward, row.from, row);
      pushTo(reverse, row.to, row);
    }

    return { forward, reverse };
  }
}

function pushTo(map: Map<string, Edge[]>, key: string, edge: Edge): void {
  const list = map.get(key);
  if (list) list.push(edge);
  else map.set(key, [edge]);
}
