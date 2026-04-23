// Minimal argv parser. We intentionally don't use commander/yargs — the surface
// is small and a hand-rolled version keeps surprises out.
//
// Format:  [positional...]  --flag value  --flag2 value2 ...
// All flags take exactly one value (no boolean shorthand).

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Flag --${key} requires a value`);
      }
      flags[key] = next;
      i++;
    } else {
      positional.push(a);
    }
  }

  return { positional, flags };
}

/** Convert kebab-case flag name to snake_case frontmatter field name. */
export function flagToField(flag: string): string {
  return flag.replace(/-/g, '_');
}
