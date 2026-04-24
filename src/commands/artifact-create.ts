// `loopany artifact create --kind X [--slug S] [--<field> <value>...] [--content <body>]`

import type { Engine } from '../core/engine.ts';
import type { FieldSpec } from '../core/kind-registry.ts';
import { parseArgs, flagToField } from './argv.ts';
import { resolveBody } from './body-input.ts';

const RESERVED = new Set(['kind', 'slug', 'content', 'content-file', 'domain']);

export interface CreateResult {
  id: string;
  kind: string;
  path: string;
}

export async function runArtifactCreate(engine: Engine, args: string[]): Promise<CreateResult> {
  const { flags } = parseArgs(args);

  const kind = flags.kind;
  if (!kind) throw new Error('Missing required flag: --kind');

  const def = engine.registry.get(kind);
  if (!def) throw new Error(`Unknown kind: ${kind}`);

  const frontmatter: Record<string, unknown> = {};
  for (const [flag, raw] of Object.entries(flags)) {
    if (RESERVED.has(flag)) continue;
    const fieldName = flagToField(flag);
    const spec = def.fieldSpecs[fieldName];
    if (!spec) {
      throw new Error(unknownFieldMessage(kind, flag, def.fieldSpecs));
    }
    frontmatter[fieldName] = coerceFlag(raw, spec);
  }

  if (flags.domain) frontmatter.domain = flags.domain;

  const opts: { slug?: string } = {};
  if (flags.slug) opts.slug = flags.slug;

  const body = await resolveBody(flags);
  const a = await engine.store.create(kind, frontmatter, body, opts);
  return { id: a.id, kind: a.kind, path: a.path };
}

function unknownFieldMessage(
  kind: string,
  badFlag: string,
  specs: Record<string, FieldSpec>,
): string {
  const fieldFlag = (name: string) => '--' + name.replace(/_/g, '-');
  const describe = (s: FieldSpec): string => {
    const parts: string[] = [s.type];
    if (s.required) parts.push('required');
    if (s.values) parts.push(`one of: ${s.values.join('|')}`);
    if (s.default !== undefined) parts.push(`default: ${JSON.stringify(s.default)}`);
    return parts.join(', ');
  };
  const entries = Object.entries(specs);
  const width = Math.max(8, ...entries.map(([n]) => fieldFlag(n).length));
  const lines = entries.map(
    ([name, spec]) => `  ${fieldFlag(name).padEnd(width)}  ${describe(spec)}`,
  );
  const fields = lines.length > 0 ? lines.join('\n') : '  (kind has no frontmatter fields)';
  return [
    `Unknown field for kind ${kind}: --${badFlag}`,
    ``,
    `Valid fields for ${kind}:`,
    fields,
    ``,
    `Reserved flags (any kind): --kind, --slug, --domain, --content, --content-file`,
  ].join('\n');
}

function coerceFlag(raw: string, spec: FieldSpec): unknown {
  switch (spec.type) {
    case 'string':
    case 'enum':
    case 'date':
      return raw;
    case 'number':
      return Number(raw);
    case 'bool':
      return /^(true|yes|1)$/i.test(raw);
    case 'string[]':
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    default:
      throw new Error(`Unsupported field type: ${spec.type}`);
  }
}
