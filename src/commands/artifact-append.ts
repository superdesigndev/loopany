// `loopany artifact append <id> --section <name> --content <text>`

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export async function runArtifactAppend(engine: Engine, args: string[]): Promise<{ id: string }> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) throw new Error('Missing positional argument: <id>');
  if (!flags.section) throw new Error('Missing required flag: --section');
  if (!flags.content) throw new Error('Missing required flag: --content');

  await engine.store.appendSection(id, flags.section, flags.content);
  return { id };
}
