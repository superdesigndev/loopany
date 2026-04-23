// `loopany artifact set <id> --field <name> --value <value>`
// Updates a single frontmatter field on an existing artifact.
// The status field is rejected — use `artifact status` instead.

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export async function runArtifactSet(
  engine: Engine,
  args: string[],
): Promise<{ id: string; field: string; value: string }> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) throw new Error('Missing positional argument: <id>');
  if (!flags.field) throw new Error('Missing required flag: --field');
  if (flags.value === undefined) throw new Error('Missing required flag: --value');

  await engine.store.setField(id, flags.field, flags.value);
  return { id, field: flags.field, value: flags.value };
}
