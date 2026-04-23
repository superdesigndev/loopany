import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditLog } from '../src/core/audit.ts';

function newPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'loopany-audit-')), 'audit.jsonl');
}

describe('AuditLog', () => {
  test('appends a single entry with auto timestamp', async () => {
    const path = newPath();
    const audit = new AuditLog(path);
    await audit.write({ op: 'artifact.create', kind: 'task', id: 'tsk-1', actor: 'cli', duration_ms: 12 });
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.op).toBe('artifact.create');
    expect(row.id).toBe('tsk-1');
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('appends multiple entries', async () => {
    const path = newPath();
    const audit = new AuditLog(path);
    await audit.write({ op: 'artifact.create', actor: 'cli', duration_ms: 1 });
    await audit.write({ op: 'artifact.status', actor: 'cli', duration_ms: 2 });
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  test('records errors', async () => {
    const path = newPath();
    const audit = new AuditLog(path);
    await audit.write({ op: 'artifact.create', actor: 'cli', duration_ms: 5, error: 'Invalid input' });
    const row = JSON.parse(readFileSync(path, 'utf-8').trim());
    expect(row.error).toBe('Invalid input');
  });

  test('load returns parsed entries', async () => {
    const path = newPath();
    const audit = new AuditLog(path);
    await audit.write({ op: 'a', actor: 'cli', duration_ms: 1 });
    await audit.write({ op: 'b', actor: 'cli', duration_ms: 2 });
    const entries = await audit.load();
    expect(entries.map((e) => e.op)).toEqual(['a', 'b']);
  });

  test('load on missing file returns empty array', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'loopany-audit-')), 'missing.jsonl');
    const entries = await new AuditLog(path).load();
    expect(entries).toEqual([]);
  });

  test('skips malformed lines on load', async () => {
    const path = newPath();
    const audit = new AuditLog(path);
    await audit.write({ op: 'good', actor: 'cli', duration_ms: 1 });
    const fs = await import('fs/promises');
    await fs.appendFile(path, 'this is not json\n');
    await audit.write({ op: 'also-good', actor: 'cli', duration_ms: 1 });

    const entries = await audit.load();
    expect(entries.map((e) => e.op)).toEqual(['good', 'also-good']);
  });
});
