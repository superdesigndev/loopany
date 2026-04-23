import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Config } from '../src/core/config.ts';

function newDir(): string {
  return mkdtempSync(join(tmpdir(), 'loopany-config-'));
}

describe('Config', () => {
  test('load on empty file returns empty defaults', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), '# empty\n');
    const c = await Config.load(dir);
    expect(c.enabledDomains()).toEqual([]);
  });

  test('load reads enabled_domains', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), 'enabled_domains:\n  - crm\n  - ads\n');
    const c = await Config.load(dir);
    expect(c.enabledDomains().sort()).toEqual(['ads', 'crm']);
  });

  test('enableDomain adds and persists', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), '# empty\n');
    const c = await Config.load(dir);
    await c.enableDomain('crm');
    expect(c.enabledDomains()).toEqual(['crm']);

    // Reload from disk
    const c2 = await Config.load(dir);
    expect(c2.enabledDomains()).toEqual(['crm']);
  });

  test('enableDomain is idempotent', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), '# empty\n');
    const c = await Config.load(dir);
    await c.enableDomain('crm');
    await c.enableDomain('crm');
    expect(c.enabledDomains()).toEqual(['crm']);
  });

  test('disableDomain removes and persists', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), 'enabled_domains:\n  - crm\n  - ads\n');
    const c = await Config.load(dir);
    await c.disableDomain('crm');
    expect(c.enabledDomains()).toEqual(['ads']);
  });

  test('disableDomain on missing domain is a no-op', async () => {
    const dir = newDir();
    writeFileSync(join(dir, 'config.yaml'), '# empty\n');
    const c = await Config.load(dir);
    await c.disableDomain('missing');
    expect(c.enabledDomains()).toEqual([]);
  });
});
