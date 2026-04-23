// `loopany domain list`                 — enabled domains + observed-in-artifacts
// `loopany domain enable <name>`         — persist to config.yaml
// `loopany domain disable <name>`        — persist to config.yaml

import type { Engine } from '../core/engine.ts';

export interface DomainListResult {
  enabled: string[];
  observed_only: string[];
}

export async function runDomainList(engine: Engine): Promise<DomainListResult> {
  const enabled = engine.config.enabledDomains();
  const idx = await engine.index();
  const observed = idx.domains();
  const enabledSet = new Set(enabled);
  const observed_only = observed.filter((d) => !enabledSet.has(d));
  return { enabled, observed_only };
}

export async function runDomainEnable(engine: Engine, args: string[]): Promise<{ enabled: string[] }> {
  const name = args[0];
  if (!name) throw new Error('Usage: loopany domain enable <name>');
  await engine.config.enableDomain(name);
  return { enabled: engine.config.enabledDomains() };
}

export async function runDomainDisable(
  engine: Engine,
  args: string[],
): Promise<{ enabled: string[] }> {
  const name = args[0];
  if (!name) throw new Error('Usage: loopany domain disable <name>');
  await engine.config.disableDomain(name);
  return { enabled: engine.config.enabledDomains() };
}
