// `loopany artifact get <id> [--format md|json]`

import { readFile } from 'fs/promises';
import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export interface GetResult {
  format: 'md' | 'json';
  body: string;
  json?: unknown;
}

export async function runArtifactGet(engine: Engine, args: string[]): Promise<GetResult> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) throw new Error('Missing positional argument: <id>');

  const a = await engine.store.get(id);
  if (!a) throw new Error(`Artifact not found: ${id}`);

  const format = (flags.format as 'md' | 'json' | undefined) ?? 'md';
  if (format === 'json') {
    return {
      format,
      body: '',
      json: { id: a.id, kind: a.kind, path: a.path, frontmatter: a.frontmatter, body: a.body },
    };
  }
  const raw = await readFile(a.path, 'utf-8');
  return { format, body: raw };
}
