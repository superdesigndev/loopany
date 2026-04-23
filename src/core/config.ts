// Workspace-level configuration at $LOOPANY_HOME/config.yaml.
// Currently tracks enabled domains; future fields land here.
//
// Shape:
//   enabled_domains: [crm, ads, ...]

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

interface ConfigData {
  enabled_domains?: string[];
}

export class Config {
  private constructor(
    private root: string,
    private data: ConfigData,
  ) {}

  static async load(root: string): Promise<Config> {
    const path = join(root, 'config.yaml');
    if (!existsSync(path)) {
      return new Config(root, {});
    }
    const raw = await readFile(path, 'utf-8');
    const parsed = (parseYaml(raw) ?? {}) as ConfigData;
    return new Config(root, parsed);
  }

  enabledDomains(): string[] {
    return [...(this.data.enabled_domains ?? [])];
  }

  async enableDomain(name: string): Promise<void> {
    const current = new Set(this.data.enabled_domains ?? []);
    if (current.has(name)) return;
    current.add(name);
    this.data.enabled_domains = [...current].sort();
    await this.persist();
  }

  async disableDomain(name: string): Promise<void> {
    const current = new Set(this.data.enabled_domains ?? []);
    if (!current.has(name)) return;
    current.delete(name);
    this.data.enabled_domains = [...current].sort();
    await this.persist();
  }

  private async persist(): Promise<void> {
    const body = stringifyYaml(this.data);
    await writeFile(join(this.root, 'config.yaml'), body, 'utf-8');
  }
}
