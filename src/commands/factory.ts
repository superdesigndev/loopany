// `loopany factory [--port N] [--host H] [--no-open]`
// Starts the walkable pixel factory UI.

import { platform } from 'os';
import type { Engine } from '../core/engine.ts';
import { startServer } from '../ui/server.ts';

const DEFAULT_PORT = 4242;

export interface FactoryArgs {
  port: number;
  host: string;
  open: boolean;
}

export function parseFactoryArgs(args: string[]): FactoryArgs {
  let port = DEFAULT_PORT;
  let host = '127.0.0.1';
  let open = true;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-open') {
      open = false;
    } else if (a === '--port') {
      const v = args[++i];
      if (!v) throw new Error('--port requires a value');
      const n = Number.parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`invalid port: ${v}`);
      }
      port = n;
    } else if (a === '--host') {
      const v = args[++i];
      if (!v) throw new Error('--host requires a value');
      host = v;
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }

  return { port, host, open };
}

export async function runFactory(engine: Engine, args: string[]): Promise<void> {
  const opts = parseFactoryArgs(args);

  const server = startServer({ engine, port: opts.port, host: opts.host });

  console.log(`loopany factory — running at ${server.url}`);
  console.log(`workspace: ${engine.root}`);
  console.log(`press Ctrl-C to stop`);

  if (opts.open) {
    openBrowser(server.url);
  }

  // Keep alive until SIGINT.
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      console.log('\nshutting down…');
      server.stop();
      resolve();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

function openBrowser(url: string): void {
  const p = platform();
  const cmd = p === 'darwin' ? 'open' : p === 'win32' ? 'start' : 'xdg-open';
  const args = p === 'win32' ? ['', url] : [url];
  try {
    Bun.spawn([cmd, ...args], { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // Ignore — user can still navigate manually.
  }
}
