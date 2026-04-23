// Composes the four core modules into one object passed to operation handlers.
// Workspace location: `$LOOPANY_HOME` if set, else `~/loopany`. Single per-user
// brain — same workspace regardless of which directory loopany is invoked from.

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ArtifactStore } from './artifact-store.ts';
import { KindRegistry } from './kind-registry.ts';
import { ReferenceGraph } from './references.ts';
import { ArtifactIndex } from './index.ts';
import { Config } from './config.ts';

export interface Engine {
  root: string;
  registry: KindRegistry;
  store: ArtifactStore;
  refs: ReferenceGraph;
  config: Config;
  index(): Promise<ArtifactIndex>;
}

export function getWorkspaceRoot(): string {
  return process.env.LOOPANY_HOME ?? join(homedir(), 'loopany');
}

export class WorkspaceNotFoundError extends Error {
  constructor(root: string) {
    super(`No loopany workspace at ${root}. Run \`loopany init\` first.`);
    this.name = 'WorkspaceNotFoundError';
  }
}

export async function bootstrap(): Promise<Engine> {
  const root = getWorkspaceRoot();
  if (!existsSync(join(root, 'kinds'))) {
    throw new WorkspaceNotFoundError(root);
  }

  const config = await Config.load(root);
  const packDirs = config
    .enabledDomains()
    .map((d) => join(root, 'domains', d, 'kinds'));
  const registry = await KindRegistry.load(join(root, 'kinds'), { packDirs });
  const store = new ArtifactStore(root, registry);
  const refs = new ReferenceGraph(join(root, 'references.jsonl'));

  return {
    root,
    registry,
    store,
    refs,
    config,
    index: () => ArtifactIndex.build(store, refs, registry),
  };
}
