// Append-only operational log at $LOOPANY_HOME/audit.jsonl.
// One line per CLI invocation (write attempts, mutations, errors).
// Reads are also recorded for "what was attempted" forensics.
//
// Row shape:
//   {"ts":"...","op":"<group>.<verb>","actor":"cli|agent","duration_ms":N,
//    ...op-specific fields,
//    "error":"...optional}

import { existsSync } from 'fs';
import { appendFile, readFile } from 'fs/promises';

export interface AuditEntryInput {
  op: string;
  actor: 'cli' | 'agent';
  duration_ms: number;
  [k: string]: unknown;
}

export interface AuditEntry extends AuditEntryInput {
  ts: string;
}

export class AuditLog {
  constructor(private path: string) {}

  async write(entry: AuditEntryInput): Promise<AuditEntry> {
    const ts = new Date().toISOString();
    const row: AuditEntry = { ts, ...entry };
    await appendFile(this.path, JSON.stringify(row) + '\n', 'utf-8');
    return row;
  }

  async load(): Promise<AuditEntry[]> {
    if (!existsSync(this.path)) return [];
    const content = await readFile(this.path, 'utf-8');
    const out: AuditEntry[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as AuditEntry);
      } catch {
        // skip malformed
      }
    }
    return out;
  }
}
