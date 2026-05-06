// Extracts wiki-style `[[<id>]]` references from artifact body content.
//
// In v0.2 there are no kind prefixes — any string matching the slug
// charset is a candidate. The graph builder still checks each target
// against the artifact set, so noise (typos, prose like `[[example]]`)
// surfaces as dangling edges in `loopany doctor`, not as silently-broken
// references.
//
// Skips matches inside fenced code blocks and inline code spans so prose
// examples don't generate spurious graph edges.

const WIKI_LINK_RE = /\[\[([^\]\s]+?)\]\]/g;
// Same Unicode charset as src/core/slug.ts. Inlined to avoid the import
// cycle (slug → markdown → link-parser).
const SLUG_LIKE_RE = /^[\p{L}\p{M}\p{N}\-_]+$/u;

export function extractLinks(body: string): string[] {
  const stripped = stripCode(body);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKI_LINK_RE.source, 'g');
  while ((m = re.exec(stripped)) !== null) {
    const candidate = m[1];
    if (!SLUG_LIKE_RE.test(candidate)) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * Return `body` with fenced-code and inline-code regions replaced by spaces
 * of the same length. Keeps indexes roughly stable so downstream regexes
 * can still report useful offsets, though we don't use offsets yet.
 */
function stripCode(body: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    if (body.startsWith('```', i)) {
      const end = body.indexOf('```', i + 3);
      const stop = end === -1 ? body.length : end + 3;
      for (let j = i; j < stop; j++) out.push(body[j] === '\n' ? '\n' : ' ');
      i = stop;
      continue;
    }
    if (body[i] === '`') {
      const end = body.indexOf('`', i + 1);
      if (end === -1) {
        out.push(body[i]);
        i++;
        continue;
      }
      for (let j = i; j <= end; j++) out.push(' ');
      i = end + 1;
      continue;
    }
    out.push(body[i]);
    i++;
  }
  return out.join('');
}
