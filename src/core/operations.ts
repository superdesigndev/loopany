// Single source of truth for all operations.
// CLI dispatches to entries here; future MCP server will too.
//
// Each operation declares: name, params (zod schema), handler, and CLI hints
// (positional arg names, flag aliases). See spec §1.

import type { z } from 'zod';

export interface Operation<P = unknown, R = unknown> {
  name: string;
  description: string;
  params: z.ZodType<P>;
  cliHints?: {
    name: string;
    positional?: string[];
    hidden?: boolean;
  };
  handler: (ctx: OperationContext, params: P) => Promise<R>;
}

export interface OperationContext {
  // Filled in once core modules land:
  // store: ArtifactStore
  // registry: KindRegistry
  // references: ReferenceGraph
  // index: ArtifactIndex
  // logger: Logger
}

export class OperationError extends Error {
  constructor(
    public code: string,
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

// Registry — populated by individual op modules in src/commands/.
export const operations: Operation[] = [];
