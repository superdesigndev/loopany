// `loopany artifact status <id> <new-status> [--reason <text>] [--addressed-by <id>]`

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export interface ArtifactStatusResult {
  id: string;
  status: string;
  reason?: string;
  addressedBy?: string;
  edgesEmitted: number;
}

export async function runArtifactStatus(
  engine: Engine,
  args: string[],
): Promise<ArtifactStatusResult> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  const newStatus = positional[1];
  if (!id || !newStatus) {
    throw new Error(
      'Usage: artifact status <id> <new-status> [--reason <text>] [--addressed-by <id>]',
    );
  }

  const addressedBy = flags['addressed-by'];

  if (newStatus === 'addressed' && !addressedBy) {
    throw new Error(
      'Transition to `addressed` requires --addressed-by <id> (the artifact taking responsibility)',
    );
  }
  if (addressedBy && newStatus !== 'addressed') {
    throw new Error(
      '--addressed-by is only valid when transitioning to `addressed`',
    );
  }

  await engine.store.setStatus(id, newStatus, flags.reason);

  let edgesEmitted = 0;
  if (addressedBy && addressedBy !== id) {
    await engine.refs.append({
      from: addressedBy,
      to: id,
      relation: 'addresses',
      actor: 'cli',
    });
    edgesEmitted = 1;
  }

  return { id, status: newStatus, reason: flags.reason, addressedBy, edgesEmitted };
}
