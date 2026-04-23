// In-memory artifact + reference index, built at CLI startup.
//
// Walks artifacts/ via ArtifactStore.listAll(), parses frontmatter,
// and populates lookup maps for fast filtering. Cost: O(n) per build.
// Acceptable below ~1k artifacts. Add an mtime cache later if needed.

import { statSync } from 'fs';
import type { ArtifactStore, Artifact } from './artifact-store.ts';
import type { Edge, ReferenceGraph } from './references.ts';
import type { KindRegistry } from './kind-registry.ts';
import { extractLinks } from './link-parser.ts';

export interface ArtifactMeta {
  id: string;
  kind: string;
  path: string;
  frontmatter: Record<string, unknown>;
}

// Per-kind field index: kind → field → stringified-value → metas
type FieldIndex = Map<string, Map<string, Map<string, ArtifactMeta[]>>>;

export class ArtifactIndex {
  private constructor(
    private metasById: Map<string, ArtifactMeta>,
    private metasByKind: Map<string, ArtifactMeta[]>,
    private metasByStatus: Map<string, ArtifactMeta[]>,
    private metasByDomain: Map<string, ArtifactMeta[]>,
    private metasByField: FieldIndex,
    private forwardRefs: Map<string, Edge[]>,
    private reverseRefs: Map<string, Edge[]>,
  ) {}

  static async build(
    store: ArtifactStore,
    refs: ReferenceGraph,
    registry?: KindRegistry,
  ): Promise<ArtifactIndex> {
    const all = await store.listAll();
    const byId = new Map<string, ArtifactMeta>();
    const byKind = new Map<string, ArtifactMeta[]>();
    const byStatus = new Map<string, ArtifactMeta[]>();
    const byDomain = new Map<string, ArtifactMeta[]>();
    const byField: FieldIndex = new Map();

    for (const a of all) {
      const meta: ArtifactMeta = {
        id: a.id,
        kind: a.kind,
        path: a.path,
        frontmatter: a.frontmatter,
      };
      byId.set(a.id, meta);
      pushTo(byKind, a.kind, meta);
      const status = a.frontmatter.status;
      if (typeof status === 'string') {
        pushTo(byStatus, status, meta);
      }
      const domain = a.frontmatter.domain;
      if (typeof domain === 'string') {
        pushTo(byDomain, domain, meta);
      }

      // Per-kind field index, driven by the kind's declared indexedFields.
      // Array-typed fields index each element separately, so querying one
      // value in the array is a direct lookup (e.g. aliases: [a, b] makes
      // both 'a' and 'b' findable).
      const def = registry?.get(a.kind);
      if (def) {
        for (const field of def.indexedFields) {
          const value = a.frontmatter[field];
          if (value === undefined || value === null) continue;
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) {
            pushToField(byField, a.kind, field, stringifyValue(v), meta);
          }
        }
      }
    }

    const { forward, reverse } = await refs.load();

    // Promote implicit edges — both from frontmatter `mentions: [...]` and
    // from body `[[id]]` wiki links. On-disk is unchanged; these edges are
    // reconstituted every build, so updating frontmatter or body is enough
    // to add/remove a mention without touching references.jsonl.
    const validPrefixes = registry
      ? new Set(registry.list().map((k) => k.idPrefix))
      : null;

    for (const a of all) {
      const ts = mtimeIso(a.path);

      // 1. Frontmatter mentions
      const mentions = a.frontmatter.mentions;
      if (Array.isArray(mentions)) {
        for (const target of mentions) {
          if (typeof target !== 'string' || target.length === 0) continue;
          pushImplicit(forward, reverse, {
            ts, from: a.id, to: target, relation: 'mentions', actor: 'frontmatter',
          });
        }
      }

      // 2. Body [[link]] references (requires registry for prefix whitelist)
      if (validPrefixes) {
        for (const target of extractLinks(a.body, validPrefixes)) {
          pushImplicit(forward, reverse, {
            ts, from: a.id, to: target, relation: 'mentions', actor: 'body',
          });
        }
      }
    }

    return new ArtifactIndex(byId, byKind, byStatus, byDomain, byField, forward, reverse);
  }

  byId(id: string): ArtifactMeta | undefined {
    return this.metasById.get(id);
  }

  byKind(kind: string): ArtifactMeta[] {
    return this.metasByKind.get(kind) ?? [];
  }

  byStatus(status: string): ArtifactMeta[] {
    return this.metasByStatus.get(status) ?? [];
  }

  byDomain(domain: string): ArtifactMeta[] {
    return this.metasByDomain.get(domain) ?? [];
  }

  /**
   * Lookup by a kind-declared `indexedFields` field. Returns [] for any
   * kind/field/value that wasn't indexed (unknown kind, field not in
   * indexedFields, or no artifact with that value). Array-typed fields
   * match if any element equals the query value.
   */
  byField(kind: string, field: string, value: unknown): ArtifactMeta[] {
    return (
      this.metasByField.get(kind)?.get(field)?.get(stringifyValue(value)) ?? []
    );
  }

  domains(): string[] {
    return [...this.metasByDomain.keys()].sort();
  }

  refsOut(id: string): Edge[] {
    return this.forwardRefs.get(id) ?? [];
  }

  refsIn(id: string): Edge[] {
    return this.reverseRefs.get(id) ?? [];
  }

  all(): ArtifactMeta[] {
    return [...this.metasById.values()];
  }

  /** Return artifacts whose check_at is on or before `today`. */
  followups(today: Date): ArtifactMeta[] {
    const cutoff = today.toISOString().slice(0, 10);
    const out: ArtifactMeta[] = [];
    for (const meta of this.metasById.values()) {
      const checkAt = meta.frontmatter.check_at;
      if (typeof checkAt !== 'string') continue;
      if (checkAt.slice(0, 10) <= cutoff) out.push(meta);
    }
    return out;
  }
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function mtimeIso(path: string): string {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function pushImplicit(
  forward: Map<string, Edge[]>,
  reverse: Map<string, Edge[]>,
  input: Omit<Edge, 'implicit'>,
): void {
  const edge: Edge = { ...input, implicit: true };
  pushTo(forward, edge.from, edge);
  pushTo(reverse, edge.to, edge);
}

function pushToField(
  map: FieldIndex,
  kind: string,
  field: string,
  value: string,
  meta: ArtifactMeta,
): void {
  let byF = map.get(kind);
  if (!byF) {
    byF = new Map();
    map.set(kind, byF);
  }
  let byV = byF.get(field);
  if (!byV) {
    byV = new Map();
    byF.set(field, byV);
  }
  const list = byV.get(value);
  if (list) list.push(meta);
  else byV.set(value, [meta]);
}

function stringifyValue(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
