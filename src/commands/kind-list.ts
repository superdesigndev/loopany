// `loopany kind list` — print registered kinds as JSON.

import type { Engine } from '../core/engine.ts';

export interface KindListEntry {
  kind: string;
  dirName: string;
  slugLayout: string;
  indexedFields: string[];
  hasStatusMachine: boolean;
}

export function runKindList(engine: Engine): KindListEntry[] {
  return engine.registry.list().map((k) => ({
    kind: k.kind,
    dirName: k.dirName,
    slugLayout: k.slugLayout,
    indexedFields: k.indexedFields,
    hasStatusMachine: !!k.statusMachine,
  }));
}
