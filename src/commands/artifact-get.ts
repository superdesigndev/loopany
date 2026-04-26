// `loopany artifact get <id> [--format md|json]`

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Engine } from '../core/engine.ts';
import { AuditLog, type AuditEntry } from '../core/audit.ts';
import { parseArgs } from './argv.ts';

const ARTIFACT_HISTORY_OPS = new Set([
  'artifact.create',
  'artifact.append',
  'artifact.status',
  'artifact.set',
  'refs.add',
]);

function formatLocalMinute(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

function toArtifactHistoryEntry(entry: AuditEntry, artifactId: string): Record<string, unknown> {
  const { actor: _actor, duration_ms: _durationMs, id, ts, ...rest } = entry;
  const out: Record<string, unknown> = { ts: formatLocalMinute(ts), ...rest };
  if (id && id !== artifactId) out.id = id;
  return out;
}

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
    const auditLog = new AuditLog(join(engine.root, 'audit.jsonl'));
    const audit = (await auditLog.load())
      .filter((entry) => {
        if (!ARTIFACT_HISTORY_OPS.has(entry.op)) return false;
        return entry.id === a.id || entry.from === a.id || entry.to === a.id;
      })
      .map((entry) => toArtifactHistoryEntry(entry, a.id));
    return {
      format,
      body: '',
      json: {
        id: a.id,
        kind: a.kind,
        path: a.path,
        frontmatter: a.frontmatter,
        body: a.body,
        audit,
      },
    };
  }
  const raw = await readFile(a.path, 'utf-8');
  return { format, body: raw };
}
