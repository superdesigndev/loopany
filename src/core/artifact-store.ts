// Read / write / list / append for markdown artifacts under loopany/artifacts/.
// Pure file operations; no DB.
//
// Time-bucketed:  artifacts/{YYYY-MM}/{idPrefix}{ts}.md       (timestamp ID)
// Flat:           artifacts/{dirName}/{idPrefix}{slug}.md     (slug ID)

import { existsSync } from 'fs';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  parseMarkdown,
  serializeMarkdown,
  appendSection as appendBodySection,
} from './markdown.ts';
import type { FieldSpec, KindDefinition, KindRegistry } from './kind-registry.ts';

const BUILTIN_FIELDS = new Set(['domain']);

// Slug = kebab-case identifier. Lowercase a–z, digits, single hyphens between
// segments. No leading/trailing hyphen, no double hyphens. This is what every
// existing kind uses (alice-chen, fundraising-2027, self) and it locks out
// path-separator chars, leading dots, spaces, and other filename hazards.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LEN = 80;

export interface Artifact {
  id: string;
  kind: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface CreateOpts {
  /** Required when idStrategy === 'slug'. */
  slug?: string;
  /** Test hook: pin the timestamp portion (without prefix) to test collisions. */
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

    // Auto-fill status from the kind's status machine initial when caller omitted it.
    // The frontmatter schema's `default` is for arbitrary field defaults; the status
    // machine's `initial` is the canonical "newly-created" state — apply it here so
    // callers don't have to repeat `--status active` on every create.
    if (def.statusMachine && frontmatter.status === undefined) {
      frontmatter = { ...frontmatter, status: def.statusMachine.initial };
    }

    const validated = def.frontmatterSchema.parse(frontmatter) as Record<string, unknown>;

    const id = await this.allocateId(def, opts);
    const path = this.pathFor(def, id);

    await mkdir(join(path, '..'), { recursive: true });
    const content = serializeMarkdown({ frontmatter: validated, body });
    await writeFile(path, content, 'utf-8');

    return { id, kind, path, frontmatter: validated, body };
  }

  async get(id: string): Promise<Artifact | null> {
    const def = this.kindForId(id);
    if (!def) return null;
    const path = this.pathFor(def, id);
    if (!existsSync(path)) return null;
    const raw = await readFile(path, 'utf-8');
    const { frontmatter, body } = parseMarkdown(raw);
    return { id, kind: def.kind, path, frontmatter, body };
  }

  async appendSection(id: string, sectionName: string, content: string): Promise<void> {
    const a = await this.requireArtifact(id);
    const newBody = appendBodySection(a.body, sectionName, content);
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: a.frontmatter, body: newBody }),
      'utf-8',
    );
  }

  async setField(id: string, field: string, rawValue: string): Promise<void> {
    if (field === 'status') {
      throw new Error('Use setStatus for the status field (it enforces the state machine)');
    }
    const a = await this.requireArtifact(id);
    const def = this.registry.get(a.kind)!;

    let value: unknown;
    if (BUILTIN_FIELDS.has(field)) {
      value = rawValue; // built-in fields are always strings
    } else {
      const spec = def.fieldSpecs[field];
      if (!spec) {
        throw new Error(`Unknown field for kind ${a.kind}: ${field}`);
      }
      value = coerceField(rawValue, spec);
    }

    const updatedFm = { ...a.frontmatter, [field]: value };
    def.frontmatterSchema.parse(updatedFm);
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: updatedFm, body: a.body }),
      'utf-8',
    );
  }

  async setStatus(id: string, newStatus: string, _reason?: string): Promise<void> {
    // Note: the `reason` arg is accepted for CLI parity but not written to the
    // body — reasons live in audit.jsonl. The body stays clean.
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

    const updatedFm = { ...a.frontmatter, status: newStatus };
    await writeFile(
      a.path,
      serializeMarkdown({ frontmatter: updatedFm, body: a.body }),
      'utf-8',
    );
  }

  async listAll(): Promise<Artifact[]> {
    const out: Artifact[] = [];
    for (const def of this.registry.list()) {
      const dir = this.kindDirRoot(def);
      if (!existsSync(dir)) continue;

      if (def.storage === 'flat') {
        out.push(...(await this.readDirArtifacts(def, dir)));
      } else {
        const months = await readdir(dir);
        for (const month of months) {
          const monthDir = join(dir, month);
          out.push(...(await this.readDirArtifacts(def, monthDir)));
        }
      }
    }
    return out;
  }

  // --- internals ---

  private async readDirArtifacts(def: KindDefinition, dir: string): Promise<Artifact[]> {
    const entries = await readdir(dir);
    const out: Artifact[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/, '');
      if (!id.startsWith(def.idPrefix)) continue;
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

  private kindForId(id: string): KindDefinition | undefined {
    const dashIdx = id.indexOf('-');
    if (dashIdx < 0) return undefined;
    return this.registry.getByPrefix(id.slice(0, dashIdx + 1));
  }

  private kindDirRoot(def: KindDefinition): string {
    if (def.storage === 'flat') {
      return join(this.root, 'artifacts', def.dirName);
    }
    return join(this.root, 'artifacts');
  }

  private pathFor(def: KindDefinition, id: string): string {
    if (def.storage === 'flat') {
      return join(this.root, 'artifacts', def.dirName, `${id}.md`);
    }
    // date-bucketed: extract YYYYMMDD from `tsk-YYYYMMDD-HHMMSS[-N]`
    const tsPart = id.slice(def.idPrefix.length);
    const yyyymm = `${tsPart.slice(0, 4)}-${tsPart.slice(4, 6)}`;
    return join(this.root, 'artifacts', yyyymm, `${id}.md`);
  }

  private async allocateId(def: KindDefinition, opts: CreateOpts): Promise<string> {
    if (def.idStrategy === 'slug') {
      if (!opts.slug) throw new Error(`Kind ${def.kind}: slug required for create`);
      if (opts.slug.startsWith(def.idPrefix)) {
        const stripped = opts.slug.slice(def.idPrefix.length);
        throw new Error(
          `Slug must not include kind prefix '${def.idPrefix}'. ` +
            `Use --slug ${stripped} (ID becomes ${def.idPrefix}${stripped}).`,
        );
      }
      if (opts.slug.length > MAX_SLUG_LEN) {
        throw new Error(
          `Slug too long: ${opts.slug.length} chars (max ${MAX_SLUG_LEN}).`,
        );
      }
      if (!SLUG_RE.test(opts.slug)) {
        throw new Error(
          `Invalid slug: ${JSON.stringify(opts.slug)}. ` +
            `Must be kebab-case: lowercase letters, digits, single hyphens between segments ` +
            `(e.g. 'alice-chen', 'fundraising-2027', 'self').`,
        );
      }
      const id = `${def.idPrefix}${opts.slug}`;
      const path = this.pathFor(def, id);
      if (existsSync(path)) {
        throw new Error(`Slug already exists: ${id}`);
      }
      return id;
    }

    // timestamp strategy
    const ts = opts.now ?? formatTs(new Date());
    const baseId = `${def.idPrefix}${ts}`;
    if (!existsSync(this.pathFor(def, baseId))) return baseId;

    for (let i = 2; i < 100; i++) {
      const id = `${baseId}-${i}`;
      if (!existsSync(this.pathFor(def, id))) return id;
    }
    throw new Error(`Could not allocate id for ${def.kind} (>=100 collisions)`);
  }
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
          throw new Error(`Expected JSON array for string[] field, got ${typeof parsed}`);
        }
        return parsed.map(String);
      }
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    default:
      throw new Error(`Unsupported field type: ${spec.type}`);
  }
}

function formatTs(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

