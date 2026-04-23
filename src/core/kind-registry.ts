// Parses loopany/kinds/*.md at startup and exposes:
//   - top-level KindDefinition fields (idPrefix, storage, idStrategy, ...)
//   - frontmatter validators (zod schemas built from the kind's YAML spec)
//   - status machines (initial + transitions map)
//
// Built dynamically — `kind` is an open registry, not a TypeScript enum.

import { z } from 'zod';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parseMarkdown } from './markdown.ts';

export type Storage = 'date-bucketed' | 'flat';
export type IdStrategy = 'timestamp' | 'slug';

export interface StatusMachine {
  initial: string;
  transitions: Record<string, string[]>;
}

export interface KindDefinition {
  kind: string;
  idPrefix: string;
  bodyMode: 'append';
  storage: Storage;
  idStrategy: IdStrategy;
  dirName: string;
  indexedFields: string[];
  description: string;
  frontmatterSchema: z.ZodTypeAny;
  fieldSpecs: Record<string, FieldSpec>;
  statusMachine?: StatusMachine;
}

export interface FieldSpec {
  type: 'string' | 'enum' | 'date' | 'bool' | 'string[]' | 'number';
  required?: boolean;
  values?: string[];
  default?: unknown;
}

const SECTION_RE = /^##\s+(.+?)\s*$/gm;
const FENCED_YAML_RE = /```yaml\n([\s\S]*?)\n```/;

export function parseKindDefinition(raw: string): KindDefinition {
  const { frontmatter: top, body } = parseMarkdown(raw);

  const kind = expectString(top.kind, 'kind');
  const idPrefix = expectString(top.idPrefix, 'idPrefix');
  const storage = expectString(top.storage, 'storage') as Storage;
  const idStrategy = expectString(top.idStrategy, 'idStrategy') as IdStrategy;
  const dirName = (top.dirName as string | undefined) ?? `${kind}s`;
  const indexedFields = (top.indexedFields as string[] | undefined) ?? [];

  const sections = splitH2Sections(body);

  const fieldSpecs = (extractYamlBlock(sections['Frontmatter']) ?? {}) as Record<
    string,
    FieldSpec
  >;
  const frontmatterSchema = buildZodSchema(fieldSpecs);

  const smYaml = extractYamlBlock(sections['Status machine']);
  const statusMachine = smYaml
    ? (smYaml as StatusMachine)
    : undefined;

  const description = sections['__intro'] ?? '';

  return {
    kind,
    idPrefix,
    bodyMode: 'append',
    storage,
    idStrategy,
    dirName,
    indexedFields,
    description,
    frontmatterSchema,
    fieldSpecs,
    statusMachine,
  };
}

function expectString(v: unknown, name: string): string {
  if (typeof v !== 'string') {
    throw new Error(`Kind definition missing required field: ${name}`);
  }
  return v;
}

function splitH2Sections(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const matches: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_RE.source, 'gm');
  while ((m = re.exec(body)) !== null) {
    matches.push({ name: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) {
    result['__intro'] = body.trim();
    return result;
  }
  result['__intro'] = body.slice(0, matches[0].index).trim();
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const headerLineEnd = body.indexOf('\n', start);
    const contentStart = headerLineEnd + 1;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    result[matches[i].name] = body.slice(contentStart, end).trim();
  }
  return result;
}

function extractYamlBlock(section: string | undefined): unknown {
  if (!section) return undefined;
  const match = section.match(FENCED_YAML_RE);
  if (!match) return undefined;
  return parseYaml(match[1]);
}

export class KindRegistry {
  private byKind = new Map<string, KindDefinition>();
  private byPrefix = new Map<string, KindDefinition>();

  static async load(
    dir: string,
    opts: { packDirs?: string[] } = {},
  ): Promise<KindRegistry> {
    const reg = new KindRegistry();
    await reg.loadFromDir(dir);
    for (const packDir of opts.packDirs ?? []) {
      // Pack dirs may not exist — user enabled a domain without writing kinds yet.
      if (!existsSync(packDir)) continue;
      await reg.loadFromDir(packDir);
    }
    return reg;
  }

  private async loadFromDir(dir: string): Promise<void> {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await readFile(join(dir, file), 'utf-8');
      const def = parseKindDefinition(raw);
      if (this.byKind.has(def.kind)) {
        throw new Error(`Duplicate kind: ${def.kind} (file: ${file})`);
      }
      this.byKind.set(def.kind, def);
      this.byPrefix.set(def.idPrefix, def);
    }
  }

  get(kind: string): KindDefinition | undefined {
    return this.byKind.get(kind);
  }

  getByPrefix(prefix: string): KindDefinition | undefined {
    return this.byPrefix.get(prefix);
  }

  list(): KindDefinition[] {
    return [...this.byKind.values()];
  }
}

function buildZodSchema(
  spec: Record<string, FieldSpec>,
): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, field] of Object.entries(spec)) {
    let s: z.ZodTypeAny;
    switch (field.type) {
      case 'string':
        s = z.string();
        break;
      case 'enum':
        if (!field.values || field.values.length === 0) {
          throw new Error(`Field ${name}: enum requires non-empty values[]`);
        }
        s = z.enum(field.values as [string, ...string[]]);
        break;
      case 'date':
        s = z.string(); // ISO date string; v1 doesn't deep-validate
        break;
      case 'bool':
        s = z.boolean();
        break;
      case 'string[]':
        s = z.array(z.string());
        break;
      case 'number':
        s = z.number();
        break;
      default:
        throw new Error(`Field ${name}: unknown type ${field.type}`);
    }
    if (field.default !== undefined) {
      s = s.default(field.default);
    } else if (!field.required) {
      s = s.optional();
    }
    shape[name] = s;
  }
  return z.object(shape).passthrough();
}
