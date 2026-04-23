// `loopany kind list` — print registered kinds as JSON.

import type { Engine } from '../core/engine.ts';

export interface KindListEntry {
  kind: string;
  idPrefix: string;
  storage: string;
  idStrategy: string;
  dirName: string;
  indexedFields: string[];
  hasStatusMachine: boolean;
}

export function runKindList(engine: Engine): KindListEntry[] {
  return engine.registry.list().map((k) => ({
    kind: k.kind,
    idPrefix: k.idPrefix,
    storage: k.storage,
    idStrategy: k.idStrategy,
    dirName: k.dirName,
    indexedFields: k.indexedFields,
    hasStatusMachine: !!k.statusMachine,
  }));
}
