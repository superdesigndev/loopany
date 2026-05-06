// Shared helpers for the v0.1.0→v0.2.0 migration scripts.
//
// Self-contained on purpose: never imports from `src/core/`. The binary
// running these scripts may already speak v0.2; the scripts must keep
// understanding the v0.1 on-disk format independently.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// ---------- workspace ----------

export function workspaceRoot(): string {
  return process.env.LOOPANY_HOME ?? join(homedir(), 'loopany');
}

export function isApply(argv = process.argv.slice(2)): boolean {
  return argv.includes('--apply');
}

export function logHeader(scriptName: string, apply: boolean): void {
  const root = workspaceRoot();
  const mode = apply ? 'APPLY' : 'dry-run';
  console.log(`# ${scriptName}  [${mode}]  workspace=${root}`);
}

// ---------- markdown ----------

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseMarkdown(raw: string): ParsedMarkdown {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: raw };
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

// ---------- old kind table ----------
// Hard-coded because the v0.2 binary may have already removed these from
// kinds/*.md by the time the migration runs. Pinned to what shipped in v0.1.

export interface OldKindEntry {
  /** old `idPrefix` field, including trailing dash */
  prefix: string;
  /** new dirName (matches what kinds/*.md will declare in v0.2) */
  dirName: string;
  /** old storage strategy — drives where to look for files */
  storage: 'flat' | 'date-bucketed';
}

export const OLD_KIND_TABLE: Record<string, OldKindEntry> = {
  brief: { prefix: 'brf-', dirName: 'briefs', storage: 'date-bucketed' },
  learning: { prefix: 'lrn-', dirName: 'learnings', storage: 'date-bucketed' },
  mission: { prefix: 'mis-', dirName: 'missions', storage: 'flat' },
  note: { prefix: 'nte-', dirName: 'notes', storage: 'flat' },
  person: { prefix: 'prs-', dirName: 'people', storage: 'flat' },
  signal: { prefix: 'sig-', dirName: 'signals', storage: 'date-bucketed' },
  'skill-proposal': {
    prefix: 'spr-',
    dirName: 'skill-proposals',
    storage: 'date-bucketed',
  },
  task: { prefix: 'tsk-', dirName: 'tasks', storage: 'date-bucketed' },
};

/** Map old prefix back to a kind. */
export function kindForOldId(id: string): { kind: string; entry: OldKindEntry } | null {
  for (const [kind, entry] of Object.entries(OLD_KIND_TABLE)) {
    if (id.startsWith(entry.prefix)) return { kind, entry };
  }
  return null;
}

/** Compute the new slug for an old id by stripping the prefix. */
export function newSlugFor(oldId: string): string | null {
  const m = kindForOldId(oldId);
  if (!m) return null;
  return oldId.slice(m.entry.prefix.length);
}

// ---------- snake_case → camelCase ----------

export const FIELD_RENAMES: Record<string, string> = {
  check_at: 'checkAt',
  for_date: 'forDate',
  target_skill: 'targetSkill',
  addressed_by: 'addressedBy',
};

export function renameKeysCamel(
  fm: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    out[FIELD_RENAMES[k] ?? k] = v;
  }
  return out;
}

// ---------- artifact discovery (v0.1 layout) ----------

export interface OldArtifactRef {
  path: string;
  oldId: string;
  kind: string;
  entry: OldKindEntry;
  /** YYYY-MM directory name when storage=date-bucketed; otherwise null. */
  monthBucket: string | null;
}

/** Walk the v0.1 artifacts/ tree and return every parseable artifact.
 *
 *  Permissive on layout: a file is migrable if its basename starts with one
 *  of the 8 known prefixes, regardless of where it lives in the tree. Real
 *  workspaces have drift (slug-style ids in date-bucketed kinds, files
 *  hand-edited into wrong dirs). Migration's job is to land them all in
 *  the v0.2 layout, not gatekeep the v0.1 invariants. */
export async function listOldArtifacts(root: string): Promise<OldArtifactRef[]> {
  const { readdir, stat } = await import('node:fs/promises');
  const out: OldArtifactRef[] = [];
  const artifactsDir = join(root, 'artifacts');
  if (!existsSync(artifactsDir)) return out;

  const top = await readdir(artifactsDir, { withFileTypes: true });
  for (const entry of top) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'journal') continue; // v0.2 already; never migrate
    const dirPath = join(artifactsDir, entry.name);
    const isMonthBucket = /^\d{4}-\d{2}$/.test(entry.name);
    const files = await readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const oldId = file.slice(0, -3);
      const m = kindForOldId(oldId);
      if (!m) continue;
      const path = join(dirPath, file);
      const st = await stat(path);
      if (!st.isFile()) continue;
      out.push({
        path,
        oldId,
        kind: m.kind,
        entry: m.entry,
        monthBucket: isMonthBucket ? entry.name : null,
      });
    }
  }
  return out;
}

// ---------- createdAt derivation ----------

/**
 * Parse the timestamp embedded in a v0.1 timestamp ID like
 * `tsk-20260427-103045[-N]` and return an ISO string. UTC because that's
 * what the v0.1 store wrote (`formatTs` used `getUTCFullYear` etc.).
 * Returns null when the id is a slug, not a timestamp.
 */
export function isoFromTimestampId(oldId: string): string | null {
  // tsk-20260427-103045 or tsk-20260427-103045-2
  const m = /^[a-z]+-(\d{8})-(\d{6})(?:-\d+)?$/.exec(oldId);
  if (!m) return null;
  const yyyymmdd = m[1];
  const hhmmss = m[2];
  const iso =
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` +
    `T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}.000Z`;
  return iso;
}

/** Date portion (YYYY-MM-DD) of an ISO datetime, in UTC. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

// ---------- id-map persistence ----------

export interface IdMapEntry {
  oldId: string;
  newId: string;
  kind: string;
  newPath: string;
  createdAt: string;
}

export interface IdMap {
  /** keyed by oldId for fast O(1) rewrite */
  byOldId: Record<string, IdMapEntry>;
}

export const ID_MAP_FILE = '.migration-id-map.json';

export async function readIdMap(root: string): Promise<IdMap | null> {
  const p = join(root, ID_MAP_FILE);
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as IdMap;
}
