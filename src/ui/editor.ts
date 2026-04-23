// Spawn the user's editor for a given artifact path.
//
// Resolution order:
//   1. $LOOPANY_EDITOR   — explicit override (e.g., `code -n`, `cursor`, `subl`)
//   2. Platform default  — `open` (macOS), `xdg-open` (Linux), `start` (Win)
//
// We deliberately skip $VISUAL and $EDITOR. Both commonly point to terminal
// editors (vim, nvim, nano) — spawning them from this server produces no
// visible window. Users who want a specific GUI editor should set
// $LOOPANY_EDITOR. Everyone else gets the OS's default app for .md files.

import { platform } from 'os';

export interface OpenResult {
  ok: boolean;
  editor: string;
  error?: string;
}

export async function openInEditor(path: string): Promise<OpenResult> {
  const { cmd, args } = resolveCommand();
  try {
    const proc = Bun.spawn([cmd, ...args, path], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    // Don't wait on GUI editors; they run until the user closes them.
    // We only care that the OS accepted the spawn.
    await Promise.race([
      proc.exited,
      new Promise<void>((resolve) => setTimeout(resolve, 150)),
    ]);
    return { ok: true, editor: cmd };
  } catch (e) {
    return {
      ok: false,
      editor: cmd,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function resolveCommand(): { cmd: string; args: string[] } {
  const override = process.env.LOOPANY_EDITOR;
  if (override && override.trim().length > 0) {
    const parts = splitShellArgs(override);
    return { cmd: parts[0], args: parts.slice(1) };
  }

  switch (platform()) {
    case 'darwin':
      return { cmd: 'open', args: [] };
    case 'win32':
      return { cmd: 'start', args: [''] }; // empty title arg for `start`
    default:
      return { cmd: 'xdg-open', args: [] };
  }
}

// Minimal shell-arg splitter — handles quoted segments but not escapes.
// Good enough for "code --wait" or "subl -n". Complex editor invocations
// should set LOOPANY_EDITOR to a wrapper script.
function splitShellArgs(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of s.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (cur.length) {
        out.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
