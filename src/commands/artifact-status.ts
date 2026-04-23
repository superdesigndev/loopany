// `loopany artifact status <id> <new-status> [--reason <text>]`

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export async function runArtifactStatus(
  engine: Engine,
  args: string[],
): Promise<{ id: string; status: string; reason?: string }> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  const newStatus = positional[1];
  if (!id || !newStatus) {
    throw new Error('Usage: artifact status <id> <new-status> [--reason <text>]');
  }

  await engine.store.setStatus(id, newStatus, flags.reason);
  return { id, status: newStatus, reason: flags.reason };
}
