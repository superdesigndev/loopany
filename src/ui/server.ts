// Bun HTTP server for the factory UI.
// Three routes only:
//   GET  /            → single-page HTML (Kaplay game)
//   GET  /api/graph   → workspace graph JSON
//   POST /api/open    → spawn editor for a given artifact id
//
// Bound to 127.0.0.1. No auth, no CORS — local-only tool.

// Bun returns a string at runtime for this import, but its TS types declare
// `.html` imports as `HTMLBundle`. We cast through unknown to sidestep that.
import indexHtmlRaw from './index.html' with { type: 'text' };
const indexHtml = indexHtmlRaw as unknown as string;
import crewletSvg from './crewlet.svg' with { type: 'text' };
import type { Engine } from '../core/engine.ts';
import { buildGraph } from './graph.ts';
import { openInEditor } from './editor.ts';

export interface StartOptions {
  engine: Engine;
  port: number;
  host?: string;
}

export interface RunningServer {
  url: string;
  stop(): void;
}

export function startServer(opts: StartOptions): RunningServer {
  const host = opts.host ?? '127.0.0.1';

  const server = Bun.serve({
    hostname: host,
    port: opts.port,
    fetch: (req) => handle(req, opts.engine),
  });

  const url = `http://${host}:${server.port}`;
  return {
    url,
    stop: () => server.stop(true),
  };
}

async function handle(req: Request, engine: Engine): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return new Response(indexHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  if (req.method === 'GET' && url.pathname === '/assets/crewlet.svg') {
    return new Response(crewletSvg as unknown as string, {
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=3600',
      },
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/graph') {
    try {
      const payload = await buildGraph(engine);
      return json(payload);
    } catch (e) {
      return json({ error: errMsg(e) }, 500);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/open') {
    try {
      const body = (await req.json()) as { id?: unknown };
      if (typeof body.id !== 'string' || !body.id.length) {
        return json({ ok: false, error: 'missing id' }, 400);
      }
      const artifact = await engine.store.get(body.id);
      if (!artifact) {
        return json({ ok: false, error: `artifact not found: ${body.id}` }, 404);
      }
      const result = await openInEditor(artifact.path);
      return json(result, result.ok ? 200 : 500);
    } catch (e) {
      return json({ ok: false, error: errMsg(e) }, 500);
    }
  }

  return new Response('Not Found', { status: 404 });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
