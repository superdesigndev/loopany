// `loopany artifact list [--kind K] [--status S] [--domain D] [--<field> V ...] [--contains Q]`
// JSON array of {id, kind, path, frontmatter}.
//
// With --kind K, any other --<flag> is treated as a frontmatter field filter.
// If the field is in K's indexedFields, it goes through the per-kind field
// index (O(1) lookup). Otherwise it's applied as a linear filter.
//
// --contains Q filters by case-insensitive body substring. Applied last,
// after structural filters, so the body-read cost is bounded to the
// narrowed candidate set.

import type { Engine } from '../core/engine.ts';
import type { ArtifactMeta } from '../core/index.ts';
import { flagToField, parseArgs } from './argv.ts';

export async function runArtifactList(engine: Engine, args: string[]): Promise<ArtifactMeta[]> {
  const { flags } = parseArgs(args);
  const idx = await engine.index();

  // Pull out --contains so it's not treated as a frontmatter field filter.
  const { contains, ...fieldFlags } = flags;

  // Start with the smallest candidate set we can grab from an index.
  let candidates: ArtifactMeta[];
  if (fieldFlags.kind) candidates = idx.byKind(fieldFlags.kind);
  else if (fieldFlags.status) candidates = idx.byStatus(fieldFlags.status);
  else if (fieldFlags.domain) candidates = idx.byDomain(fieldFlags.domain);
  else candidates = idx.all();

  const kindDef = fieldFlags.kind ? engine.registry.get(fieldFlags.kind) : undefined;

  for (const [flag, value] of Object.entries(fieldFlags)) {
    if (flag === 'kind') continue; // already used as seed
    const field = flagToField(flag);

    // If we have a kind and the field is indexed for it, intersect with
    // the per-kind index — fastest path.
    if (kindDef && kindDef.indexedFields.includes(field)) {
      const hits = new Set(idx.byField(fieldFlags.kind!, field, value).map((m) => m.id));
      candidates = candidates.filter((m) => hits.has(m.id));
      continue;
    }

    // Fallback: linear filter. Handles arbitrary frontmatter fields and
    // arrays (string[] matches if any element equals the query value).
    candidates = candidates.filter((m) => matchesField(m.frontmatter[field], value));
  }

  if (contains !== undefined) {
    const needle = contains.toLowerCase();
    const matched: ArtifactMeta[] = [];
    for (const m of candidates) {
      if (frontmatterMatches(m.frontmatter, needle)) {
        matched.push(m);
        continue;
      }
      const a = await engine.store.get(m.id);
      if (a && a.body.toLowerCase().includes(needle)) matched.push(m);
    }
    candidates = matched;
  }

  return candidates;
}

/** True if any string-valued frontmatter field contains `needle`
 *  (already lowercased). Checks string and string[] values; other
 *  types are skipped — use dedicated field flags for them. */
function frontmatterMatches(fm: Record<string, unknown>, needle: string): boolean {
  for (const v of Object.values(fm)) {
    if (typeof v === 'string') {
      if (v.toLowerCase().includes(needle)) return true;
    } else if (Array.isArray(v)) {
      for (const el of v) {
        if (typeof el === 'string' && el.toLowerCase().includes(needle)) return true;
      }
    }
  }
  return false;
}

function matchesField(fieldValue: unknown, queryValue: string): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;
  if (Array.isArray(fieldValue)) return fieldValue.map(String).includes(queryValue);
  return String(fieldValue) === queryValue;
}
