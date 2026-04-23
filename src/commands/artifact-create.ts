// `loopany artifact create --kind X [--slug S] [--<field> <value>...] [--content <body>]`

import type { Engine } from '../core/engine.ts';
import type { FieldSpec } from '../core/kind-registry.ts';
import { parseArgs, flagToField } from './argv.ts';

const RESERVED = new Set(['kind', 'slug', 'content', 'domain']);

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
      throw new Error(`Unknown field for kind ${kind}: --${flag}`);
    }
    frontmatter[fieldName] = coerceFlag(raw, spec);
  }

  if (flags.domain) frontmatter.domain = flags.domain;

  const opts: { slug?: string } = {};
  if (flags.slug) opts.slug = flags.slug;

  const body = flags.content ?? '';
  const a = await engine.store.create(kind, frontmatter, body, opts);
  return { id: a.id, kind: a.kind, path: a.path };
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
