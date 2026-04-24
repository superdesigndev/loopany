// `loopany artifact append <id> --section <name> (--content <text> | --content-file <path|->)`

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';
import { resolveBody } from './body-input.ts';

export async function runArtifactAppend(engine: Engine, args: string[]): Promise<{ id: string }> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) throw new Error('Missing positional argument: <id>');
  if (!flags.section) throw new Error('Missing required flag: --section');
  if (flags.content === undefined && flags['content-file'] === undefined) {
    throw new Error('Missing body: pass --content <text> or --content-file <path|->.');
  }

  const body = await resolveBody(flags);
  if (!body) throw new Error('Cannot append an empty section body.');

  await engine.store.appendSection(id, flags.section, body);
  return { id };
}
