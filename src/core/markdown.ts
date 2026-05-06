// Parse and serialize markdown + YAML frontmatter.
//
// Splits a file into { frontmatter, body }, where frontmatter is the YAML
// block delimited by `---` at the start of the file. Body is everything
// after the second `---`, including all H2 sections.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseMarkdown(raw: string): ParsedMarkdown {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  const [, yamlBlock, body] = match;
  const frontmatter = (parseYaml(yamlBlock) ?? {}) as Record<string, unknown>;
  return { frontmatter, body: body ?? '' };
}

export function serializeMarkdown(parsed: ParsedMarkdown): string {
  const yaml = stringifyYaml(parsed.frontmatter).trimEnd();
  const trimmedBody = parsed.body.replace(/\s+$/, '');
  const bodyPart = trimmedBody.length > 0 ? `\n${trimmedBody}\n` : '\n';
  return `---\n${yaml}\n---${bodyPart}`;
}

export function appendSection(
  body: string,
  sectionName: string,
  content: string,
): string {
  const header = `## ${sectionName}`;
  const headerRe = new RegExp(`^## ${escapeRegex(sectionName)}\\s*$`, 'm');
  const match = body.match(headerRe);

  if (match && match.index !== undefined) {
    // Section exists — append content under it, before the next H2 (or EOF).
    const headerEnd = body.indexOf('\n', match.index) + 1;
    const nextH2 = body.slice(headerEnd).search(/^## /m);
    const sectionEnd = nextH2 === -1 ? body.length : headerEnd + nextH2;
    const before = body.slice(0, sectionEnd).replace(/\s+$/, '');
    const after = body.slice(sectionEnd);
    const tail = after.length > 0 ? `\n\n${after.replace(/^\n+/, '')}` : '\n';
    return `${before}\n\n${content.trim()}${tail}`;
  }

  // Section does not exist — append a new one at the end.
  const trimmed = body.trimEnd();
  const sep = trimmed.length > 0 ? '\n\n' : '';
  return `${trimmed}${sep}${header}\n\n${content.trim()}\n`;
}

/**
 * Append `- <line>` under section `sectionName`. Section is created if
 * it doesn't exist yet. Used by the journal auto-link mechanism: every
 * non-journal artifact create appends one line to today's journal under
 * `## Activity`. Idempotent on the line content — if the exact `- <line>`
 * already exists in the section, no second copy is added.
 */
export function appendListItem(
  body: string,
  sectionName: string,
  line: string,
): string {
  const item = `- ${line}`;
  const headerRe = new RegExp(`^## ${escapeRegex(sectionName)}\\s*$`, 'm');
  const m = body.match(headerRe);
  if (!m || m.index === undefined) {
    const trimmed = body.trimEnd();
    const sep = trimmed.length > 0 ? '\n\n' : '';
    return `${trimmed}${sep}## ${sectionName}\n\n${item}\n`;
  }
  const headerEnd = body.indexOf('\n', m.index) + 1;
  const nextH2 = body.slice(headerEnd).search(/^## /m);
  const sectionEnd = nextH2 === -1 ? body.length : headerEnd + nextH2;
  const sectionBody = body.slice(headerEnd, sectionEnd);
  if (sectionBody.split('\n').some((l) => l.trim() === item)) {
    return body; // idempotent — already there
  }
  const before = body.slice(0, sectionEnd).replace(/\s+$/, '');
  const after = body.slice(sectionEnd);
  const tail = after.length > 0 ? `\n\n${after.replace(/^\n+/, '')}` : '\n';
  return `${before}\n${item}${tail}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
