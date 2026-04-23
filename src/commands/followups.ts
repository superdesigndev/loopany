// `loopany followups [--due today|overdue|next-7d] [--include-done true]`
// Reads `check_at` frontmatter on every artifact and returns due ones.
// By default, hides artifacts whose status is terminal (no outgoing
// transitions in the kind's status machine — e.g. done, cancelled, failed
// for tasks). `--include-done true` disables the filter.

import type { Engine } from '../core/engine.ts';
import type { ArtifactMeta } from '../core/index.ts';
import { parseArgs } from './argv.ts';

export async function runFollowups(engine: Engine, args: string[]): Promise<ArtifactMeta[]> {
  const { flags } = parseArgs(args);
  const due = (flags.due ?? 'today') as 'today' | 'overdue' | 'next-7d';
  const includeDone = flags['include-done'] === 'true';
  const idx = await engine.index();

  const today = new Date();
  const cutoffDate = new Date(today);
  if (due === 'next-7d') cutoffDate.setDate(today.getDate() + 7);

  let all = idx.followups(cutoffDate);

  if (!includeDone) {
    all = all.filter((m) => !isTerminalStatus(engine, m));
  }

  if (flags.domain) {
    all = all.filter((m) => m.frontmatter.domain === flags.domain);
  }

  if (due !== 'overdue') return all;

  const todayStr = today.toISOString().slice(0, 10);
  return all.filter((m) => {
    const checkAt = m.frontmatter.check_at;
    return typeof checkAt === 'string' && checkAt.slice(0, 10) < todayStr;
  });
}

function isTerminalStatus(engine: Engine, meta: ArtifactMeta): boolean {
  const status = meta.frontmatter.status;
  if (typeof status !== 'string') return false;
  const def = engine.registry.get(meta.kind);
  if (!def?.statusMachine) return false;
  const outgoing = def.statusMachine.transitions[status] ?? [];
  return outgoing.length === 0;
}
