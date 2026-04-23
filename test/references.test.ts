import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReferenceGraph } from '../src/core/references.ts';

function newDir(): string {
  return mkdtempSync(join(tmpdir(), 'loopany-refs-'));
}

describe('ReferenceGraph', () => {
  test('append + load round trip', async () => {
    const path = join(newDir(), 'references.jsonl');
    const g = new ReferenceGraph(path);
    await g.append({ from: 'sig-1', to: 'tsk-1', relation: 'led-to', actor: 'agent' });
    await g.append({ from: 'tsk-1', to: 'prs-alice', relation: 'mentions', actor: 'agent' });

    const g2 = new ReferenceGraph(path);
    const { forward, reverse } = await g2.load();

    expect(forward.get('sig-1')).toEqual([
      expect.objectContaining({ to: 'tsk-1', relation: 'led-to' }),
    ]);
    expect(reverse.get('tsk-1')).toEqual([
      expect.objectContaining({ from: 'sig-1', relation: 'led-to' }),
    ]);
    expect(reverse.get('prs-alice')).toHaveLength(1);
  });

  test('load on missing file returns empty maps', async () => {
    const path = join(newDir(), 'missing.jsonl');
    const { forward, reverse } = await new ReferenceGraph(path).load();
    expect(forward.size).toBe(0);
    expect(reverse.size).toBe(0);
  });

  test('append writes timestamp automatically', async () => {
    const path = join(newDir(), 'references.jsonl');
    const g = new ReferenceGraph(path);
    await g.append({ from: 'a', to: 'b', relation: 'x', actor: 'cli' });

    const { forward } = await g.load();
    const edge = forward.get('a')![0];
    expect(edge.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('multiple edges from same source aggregate', async () => {
    const path = join(newDir(), 'references.jsonl');
    const g = new ReferenceGraph(path);
    await g.append({ from: 'a', to: 'b', relation: 'r1', actor: 'cli' });
    await g.append({ from: 'a', to: 'c', relation: 'r2', actor: 'cli' });
    await g.append({ from: 'a', to: 'd', relation: 'r3', actor: 'cli' });

    const { forward } = await g.load();
    expect(forward.get('a')).toHaveLength(3);
  });

  test('skips malformed lines on load', async () => {
    const path = join(newDir(), 'references.jsonl');
    const g = new ReferenceGraph(path);
    await g.append({ from: 'a', to: 'b', relation: 'r', actor: 'cli' });
    // Manually corrupt the file with a junk line
    const fs = await import('fs/promises');
    await fs.appendFile(path, 'not json at all\n');
    await g.append({ from: 'c', to: 'd', relation: 'r', actor: 'cli' });

    const { forward } = await new ReferenceGraph(path).load();
    expect(forward.size).toBe(2);
  });
});
