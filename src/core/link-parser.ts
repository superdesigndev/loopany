// Extracts wiki-style `[[<id>]]` references from artifact body content.
// Only matches strings beginning with a known kind idPrefix (e.g. `tsk-`,
// `prs-`). Skips matches inside fenced code blocks and inline code spans
// so prose examples don't generate spurious graph edges.
//
// Usage:
//   const prefixes = new Set(registry.list().map(k => k.idPrefix));
//   const ids = extractLinks(body, prefixes);

const WIKI_LINK_RE = /\[\[([^\]\s]+?)\]\]/g;

export function extractLinks(body: string, validPrefixes: Set<string>): string[] {
  const stripped = stripCode(body);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKI_LINK_RE.source, 'g');
  while ((m = re.exec(stripped)) !== null) {
    const candidate = m[1];
    const dashIdx = candidate.indexOf('-');
    if (dashIdx < 0) continue;
    const prefix = candidate.slice(0, dashIdx + 1);
    if (!validPrefixes.has(prefix)) continue;
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
    // Fenced code block: ``` ... ```
    if (body.startsWith('```', i)) {
      const end = body.indexOf('```', i + 3);
      const stop = end === -1 ? body.length : end + 3;
      for (let j = i; j < stop; j++) out.push(body[j] === '\n' ? '\n' : ' ');
      i = stop;
      continue;
    }
    // Inline code: `...`
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
