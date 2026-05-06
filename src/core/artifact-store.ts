// Read / write / list / append for markdown artifacts under loopany/artifacts/.
// Pure file operations; no DB.
//
// v0.2 layout:  artifacts/<dirName>/<id>.md         (slugLayout: 'flat')
//               artifacts/<dirName>/<YYYY>/<id>.md  (slugLayout: 'year')
//
// IDs are globally unique slugs (no kind prefix). `get(id)` walks the
// registered kind directories — cheap because registries are ~10 kinds.

import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  parseMarkdown,
  serializeMarkdown,
  appendSection as appendBodySection,
  appendListItem,
} from './markdown.ts';
import type { FieldSpec, KindDefinition, KindRegistry } from './kind-registry.ts';
import {
  generateFallbackSlug,
  requireValidSlug,
  slugifyTitle,
} from './slug.ts';

// Built-in fields the store accepts on every kind (no per-kind schema
// required). `domain` is a cross-kind tag; `createdAt` / `updatedAt` are
// auto-stamped on writes; `_backfilled` marks artifacts seeded by the
// migration script (routes them to the journal Backfilled section).
const BUILTIN_FIELDS = new Set([
  'domain',
  'createdAt',
  'updatedAt',
  '_backfilled',
]);

const JOURNAL_KIND = 'journal';

export interface Artifact {
  id: string;
  kind: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface CreateOpts {
  /** Optional slug. Omit to auto-mint `YYYYMMDD-HHMMSS-<3hex>`. */
  slug?: string;
  /** Test hook: pin the auto-mint timestamp for deterministic ids. */
  now?: string;
}

export class ArtifactStore {
  constructor(
    private root: string,
    private registry: KindRegistry,
  ) {}

  async create(
    kind: string,
    frontmatter: Record<string, unknown>,
    body = '',
    opts: CreateOpts = {},
  ): Promise<Artifact> {
    const def = this.registry.get(kind);
    if (!def) throw new Error(`Unknown kind: ${kind}`);

    // Auto-fill status from the kind's status machine initial when omitted.
    if (def.statusMachine && frontmatter.status === undefined) {
      frontmatter = { ...frontmatter, status: def.statusMachine.initial };
    }

    const now = opts.now ?? new Date().toISOString();
    const fmStamped = withWriteTimestamps(frontmatter, { isCreate: true, now });
    const validated = def.frontmatterSchema.parse(fmStamped) as Record<
      string,
      unknown
    >;

    // Pull title hint AFTER validation so the auto-allocator sees the same
    // value the file will carry. If the kind doesn't have a string title,
    // hint is undefined and we fall through to the timestamp slug.
    const titleHint =
      typeof validated.title === 'string' ? validated.title : undefined;
    const id = await this.allocateId(def, opts, titleHint);
    const path = this.pathFor(def, id);

    await mkdir(join(path, '..'), { recursive: true });
    const content = serializeMarkdown({ frontmatter: validated, body });
    await writeFile(path, content, 'utf-8');

    const artifact: Artifact = { id, kind, path, frontmatter: validated, body };

    // Auto-link into today's journal. Best-effort: failures are logged but
    // never throw, so artifact creation stays atomic from the caller's view.
    if (kind !== JOURNAL_KIND && this.registry.get(JOURNAL_KIND)) {
      try {
        await this.appendToTodayJournal(artifact);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `loopany: failed to append ${id} to today's journal — ${msg}`,
        );
      }
    }

    return artifact;
  }

  async get(id: string): Promise<Artifact | null> {
    // Slugs are globally unique by construction, so probing every kind dir
    // for `<id>.md` is correct and cheap (~10 stat calls).
    for (const def of this.registry.list()) {
      const path = this.pathFor(def, id);
      if (existsSync(path)) {
        const raw = await readFile(path, 'utf-8');
        const { frontmatter, body } = parseMarkdown(raw);
        return { id, kind: def.kind, path, frontmatter, body };
      }
    }
    return null;
  }

  async appendSection(
    id: string,
    sectionName: string,
    content: string,
  ): Promise<void> {
    const a = await this.requireArtifact(id);
    const newBody = appendBodySection(a.body, sectionName, content);
    const fm = withWriteTimestamps(a.frontmatter, { isCreate: false });
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: fm, body: newBody }),
      'utf-8',
    );
  }

  async setField(id: string, field: string, rawValue: string): Promise<void> {
    if (field === 'status') {
      throw new Error(
        'Use setStatus for the status field (it enforces the state machine)',
      );
    }
    const a = await this.requireArtifact(id);
    const def = this.registry.get(a.kind)!;

    let value: unknown;
    if (BUILTIN_FIELDS.has(field)) {
      value = rawValue;
    } else {
      const spec = def.fieldSpecs[field];
      if (!spec) {
        throw new Error(`Unknown field for kind ${a.kind}: ${field}`);
      }
      value = coerceField(rawValue, spec);
    }

    const updatedFm = withWriteTimestamps(
      { ...a.frontmatter, [field]: value },
      { isCreate: false },
    );
    def.frontmatterSchema.parse(updatedFm);
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: updatedFm, body: a.body }),
      'utf-8',
    );
  }

  async setStatus(id: string, newStatus: string, _reason?: string): Promise<void> {
    const a = await this.requireArtifact(id);
    const def = this.registry.get(a.kind)!;
    if (!def.statusMachine) {
      throw new Error(`Kind ${a.kind} has no status machine`);
    }

    const current = a.frontmatter.status as string | undefined;
    const allowed = current ? def.statusMachine.transitions[current] ?? [] : [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Illegal transition: ${current ?? '(unset)'} → ${newStatus} ` +
          `(allowed: [${allowed.join(', ')}])`,
      );
    }

    const updatedFm = withWriteTimestamps(
      { ...a.frontmatter, status: newStatus },
      { isCreate: false },
    );
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: updatedFm, body: a.body }),
      'utf-8',
    );
  }

  async listAll(): Promise<Artifact[]> {
    const out: Artifact[] = [];
    for (const def of this.registry.list()) {
      const dir = join(this.root, 'artifacts', def.dirName);
      if (!existsSync(dir)) continue;

      if (def.slugLayout === 'year') {
        const years = await readdir(dir, { withFileTypes: true });
        for (const yr of years) {
          if (!yr.isDirectory()) continue;
          if (!/^\d{4}$/.test(yr.name)) continue;
          out.push(...(await this.readDirArtifacts(def, join(dir, yr.name))));
        }
      } else {
        out.push(...(await this.readDirArtifacts(def, dir)));
      }
    }
    return out;
  }

  // --- internals ---

  private async appendToTodayJournal(artifact: Artifact): Promise<void> {
    const journalDef = this.registry.get(JOURNAL_KIND);
    if (!journalDef) return;

    const isBackfilled = artifact.frontmatter._backfilled === true;
    const sectionName = isBackfilled ? 'Backfilled' : 'Activity';
    const createdAt = String(artifact.frontmatter.createdAt ?? '');
    const date = createdAt.slice(0, 10) || isoDate(new Date());
    const time = isoTime(createdAt);
    const title =
      typeof artifact.frontmatter.title === 'string'
        ? artifact.frontmatter.title
        : '';
    const titleSuffix = title ? ` — ${title}` : '';
    const linePrefix = isBackfilled || !time ? '' : `${time} `;
    const line = `${linePrefix}[[${artifact.id}]]${titleSuffix}`;

    const journalPath = this.pathFor(journalDef, date);

    await mkdir(join(journalPath, '..'), { recursive: true });

    if (!existsSync(journalPath)) {
      const skeleton = serializeMarkdown({
        frontmatter: withWriteTimestamps(
          { date },
          { isCreate: true, now: `${date}T00:00:00.000Z` },
        ),
        body: `# ${date}\n\n## ${sectionName}\n\n- ${line}\n`,
      });
      // Concurrent creates: `wx` errors on EEXIST; fall through to append.
      try {
        await writeFile(journalPath, skeleton, { flag: 'wx' });
        return;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }

    const raw = await readFile(journalPath, 'utf-8');
    const { frontmatter, body } = parseMarkdown(raw);
    const newBody = appendListItem(body, sectionName, line);
    const fm = withWriteTimestamps(frontmatter, { isCreate: false });
    await writeFile(
      journalPath,
      serializeMarkdown({ frontmatter: fm, body: newBody }),
      'utf-8',
    );
  }

  private async readDirArtifacts(
    def: KindDefinition,
    dir: string,
  ): Promise<Artifact[]> {
    const entries = await readdir(dir);
    const out: Artifact[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/, '');
      const path = join(dir, entry);
      const raw = await readFile(path, 'utf-8');
      const { frontmatter, body } = parseMarkdown(raw);
      out.push({ id, kind: def.kind, path, frontmatter, body });
    }
    return out;
  }

  private async requireArtifact(id: string): Promise<Artifact> {
    const a = await this.get(id);
    if (!a) throw new Error(`Artifact not found: ${id}`);
    return a;
  }

  private pathFor(def: KindDefinition, id: string): string {
    const base = join(this.root, 'artifacts', def.dirName);
    if (def.slugLayout === 'year') {
      const year = id.slice(0, 4);
      return join(base, year, `${id}.md`);
    }
    return join(base, `${id}.md`);
  }

  /**
   * Resolve an id for a new artifact. Preference order:
   *   1. `opts.slug` (caller-supplied, validated, must be globally unique).
   *   2. Slugified `titleHint` (e.g. "Reddit Claude design" → `reddit-claude-design`).
   *      Collisions append `-2`, `-3`, … so legible ids stay legible.
   *   3. Timestamp fallback `YYYYMMDD-HHMMSS-<3hex>`.
   *
   * The title path is the common-case win — it keeps `[[citations]]` in
   * prose readable instead of turning every reference into an opaque
   * timestamp string.
   */
  private async allocateId(
    def: KindDefinition,
    opts: CreateOpts,
    titleHint?: string,
  ): Promise<string> {
    if (opts.slug !== undefined) {
      const id = requireValidSlug(opts.slug);
      if (await this.idTaken(id)) {
        throw new Error(`Slug already exists: ${id}`);
      }
      return id;
    }

    // Step 1: try a clean title-derived slug.
    if (titleHint !== undefined) {
      const base = slugifyTitle(titleHint);
      if (base !== null) {
        if (!(await this.idTaken(base))) return base;
        for (let i = 2; i < 100; i++) {
          const candidate = `${base}-${i}`;
          if (!(await this.idTaken(candidate))) return candidate;
        }
        // 99 collisions in a row almost certainly means a hot batch with
        // identical titles — fall through to the timestamp form rather
        // than picking arbitrarily.
      }
    }

    // Step 2: timestamp fallback. Used when titleHint is missing or
    // slugifies to nothing (emoji-only titles, pure punctuation, etc.).
    const baseTs = opts.now ?? undefined;
    for (let i = 0; i < 100; i++) {
      const candidate = generateFallbackSlug(
        baseTs ? new Date(baseTs) : new Date(),
      );
      if (!(await this.idTaken(candidate))) return candidate;
    }
    throw new Error(`Could not allocate fallback slug for ${def.kind}`);
  }

  /** True when any registered kind has `<id>.md` under its dir. */
  private async idTaken(id: string): Promise<boolean> {
    for (const def of this.registry.list()) {
      if (existsSync(this.pathFor(def, id))) return true;
    }
    return false;
  }
}

/**
 * Stamp `createdAt` (only on create, only if missing) and `updatedAt`
 * (every write). Preserves any explicit value the caller already set.
 */
function withWriteTimestamps(
  fm: Record<string, unknown>,
  { isCreate, now }: { isCreate: boolean; now?: string },
): Record<string, unknown> {
  const ts = now ?? new Date().toISOString();
  const next: Record<string, unknown> = { ...fm };
  if (isCreate && typeof next.createdAt !== 'string') next.createdAt = ts;
  next.updatedAt = ts;
  return next;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoTime(iso: string): string {
  // Accepts a full ISO datetime; returns HH:MM. Empty string if not
  // parseable (caller falls back to the no-prefix form).
  if (iso.length < 16) return '';
  return iso.slice(11, 16);
}

function coerceField(raw: string, spec: FieldSpec): unknown {
  switch (spec.type) {
    case 'string':
    case 'enum':
    case 'date':
      return raw;
    case 'number':
      return Number(raw);
    case 'bool':
      return /^(true|yes|1)$/i.test(raw);
    case 'string[]': {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new Error(
            `Expected JSON array for string[] field, got ${typeof parsed}`,
          );
        }
        return parsed.map(String);
      }
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    default:
      throw new Error(`Unsupported field type: ${spec.type}`);
  }
}
