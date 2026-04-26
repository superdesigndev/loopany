#!/usr/bin/env bun
import { existsSync } from 'fs';
import { join } from 'path';
import { ZodError } from 'zod';
import { VERSION } from './version.ts';
import { bootstrap, getWorkspaceRoot, WorkspaceNotFoundError } from './core/engine.ts';
import { AuditLog } from './core/audit.ts';
import { runInit } from './commands/init.ts';
import { runKindList } from './commands/kind-list.ts';
import { runArtifactCreate } from './commands/artifact-create.ts';
import { runArtifactGet } from './commands/artifact-get.ts';
import { runArtifactList } from './commands/artifact-list.ts';
import { runArtifactAppend } from './commands/artifact-append.ts';
import { runArtifactStatus } from './commands/artifact-status.ts';
import { runArtifactSet } from './commands/artifact-set.ts';
import { runRefsAdd, runRefsQuery } from './commands/refs.ts';
import { runTrace } from './commands/trace.ts';
import { runFollowups } from './commands/followups.ts';
import { runDoctor, formatReport } from './commands/doctor.ts';
import { runDomainList, runDomainEnable, runDomainDisable } from './commands/domain.ts';
import { runFactory } from './commands/factory.ts';
import { runSearch } from './commands/search.ts';
import { runReindex } from './commands/reindex.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const head = args[0];

  if (!head || head === '--help' || head === '-h') {
    printHelp();
    return;
  }
  if (head === '--version' || head === 'version') {
    console.log(`loopany ${VERSION}`);
    return;
  }

  // Sub-command grouping. `kind` and `artifact` always take a sub-verb.
  // `refs add` is a sub-command; `refs <id>` is a query — distinguish on the literal "add".
  const KIND_GROUPS = new Set(['kind', 'artifact', 'domain']);
  let cmdKey: string;
  let rest: string[];
  if (KIND_GROUPS.has(head) && args[1]) {
    cmdKey = `${head} ${args[1]}`;
    rest = args.slice(2);
  } else if (head === 'refs' && args[1] === 'add') {
    cmdKey = 'refs add';
    rest = args.slice(2);
  } else {
    cmdKey = head;
    rest = args.slice(1);
  }

  const start = Date.now();
  const meta: Record<string, unknown> = { op: cmdKey.replace(' ', '.') };
  let caught: unknown;

  try {
    await dispatch(cmdKey, rest, meta);
  } catch (e) {
    caught = e;
  }

  // Best-effort audit write — never crashes the user-facing operation
  await tryWriteAudit(meta, Date.now() - start, caught);

  if (caught) {
    if (caught instanceof WorkspaceNotFoundError) {
      console.error(`Error: ${caught.message}`);
      process.exit(1);
    }
    if (caught instanceof ZodError) {
      console.error('Invalid input:');
      for (const issue of caught.errors) {
        const path = issue.path.length ? issue.path.join('.') : '(root)';
        console.error(`  - ${path}: ${issue.message}`);
      }
      process.exit(1);
    }
    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exit(1);
  }
}

async function tryWriteAudit(
  meta: Record<string, unknown>,
  duration_ms: number,
  caught: unknown,
): Promise<void> {
  const root = getWorkspaceRoot();
  if (!existsSync(root)) return;
  try {
    const audit = new AuditLog(join(root, 'audit.jsonl'));
    const entry: Record<string, unknown> = { ...meta, actor: 'cli', duration_ms };
    if (caught instanceof Error) entry.error = caught.message;
    else if (caught) entry.error = String(caught);
    await audit.write(entry as Parameters<AuditLog['write']>[0]);
  } catch {
    // Audit failures are silent — they should not break user-facing ops
  }
}

async function dispatch(
  cmd: string,
  _rest: string[],
  meta: Record<string, unknown>,
): Promise<void> {
  switch (cmd) {
    case 'init': {
      const r = await runInit();
      meta.created_count = r.created.length;
      meta.needs_onboarding = r.needsOnboarding;
      console.log(`Initialized loopany workspace at ${r.root}`);
      if (r.created.length) {
        console.log(`Created ${r.created.length} file(s).`);
      } else {
        console.log('Workspace already initialized — nothing to do.');
      }
      if (r.needsOnboarding) {
        console.log('');
        console.log('NEXT — read ONBOARDING.md and start the onboarding conversation.');
        console.log('Without an active goal artifact, the brain has no reason to exist.');
      }
      return;
    }
    case 'kind list': {
      const engine = await bootstrap();
      const result = runKindList(engine);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'artifact create': {
      const engine = await bootstrap();
      const result = await runArtifactCreate(engine, _rest);
      meta.kind = result.kind;
      meta.id = result.id;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'artifact get': {
      const engine = await bootstrap();
      const result = await runArtifactGet(engine, _rest);
      if (result.format === 'json') {
        process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
      } else {
        process.stdout.write(result.body);
      }
      return;
    }
    case 'artifact list': {
      const engine = await bootstrap();
      const result = await runArtifactList(engine, _rest);
      meta.count = result.length;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'artifact append': {
      const engine = await bootstrap();
      const result = await runArtifactAppend(engine, _rest);
      meta.id = result.id;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'artifact status': {
      const engine = await bootstrap();
      const result = await runArtifactStatus(engine, _rest);
      meta.id = result.id;
      meta.new_status = result.status;
      if (result.reason) meta.reason = result.reason;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'artifact set': {
      const engine = await bootstrap();
      const result = await runArtifactSet(engine, _rest);
      meta.id = result.id;
      meta.field = result.field;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'refs add': {
      const engine = await bootstrap();
      const result = await runRefsAdd(engine, _rest);
      meta.from = result.from;
      meta.to = result.to;
      meta.relation = result.relation;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'refs': {
      const engine = await bootstrap();
      const result = await runRefsQuery(engine, _rest);
      meta.count = result.length;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'trace': {
      const engine = await bootstrap();
      const result = await runTrace(engine, _rest);
      meta.nodes = result.nodes.length;
      meta.edges = result.edges.length;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'followups': {
      const engine = await bootstrap();
      const result = await runFollowups(engine, _rest);
      meta.count = result.length;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'domain list': {
      const engine = await bootstrap();
      const result = await runDomainList(engine);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'domain enable': {
      const engine = await bootstrap();
      const result = await runDomainEnable(engine, _rest);
      meta.domain = _rest[0];
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'domain disable': {
      const engine = await bootstrap();
      const result = await runDomainDisable(engine, _rest);
      meta.domain = _rest[0];
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'factory': {
      const engine = await bootstrap();
      await runFactory(engine, _rest);
      return;
    }
    case 'search': {
      const engine = await bootstrap();
      const result = await runSearch(engine, _rest);
      meta.count = result.length;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'reindex': {
      const engine = await bootstrap();
      const result = await runReindex(engine, _rest);
      meta.indexed = result.indexed;
      meta.skipped = result.skipped;
      meta.removed = result.removed;
      meta.embedder = result.embedder;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'doctor': {
      const engine = await bootstrap();
      const report = await runDoctor(engine, _rest);
      meta.ok = report.ok;
      meta.failed_checks = report.checks.filter((c) => c.status === 'fail').map((c) => c.name);
      const wantJson = _rest.includes('--format') && _rest[_rest.indexOf('--format') + 1] === 'json';
      if (wantJson) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        process.stdout.write(formatReport(report));
      }
      if (!report.ok) process.exit(1);
      return;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Run loopany --help for available commands.');
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`loopany ${VERSION} -- long-running agent brain

USAGE
  loopany <command> [options]

INIT
  init                                  Scaffold workspace at $LOOPANY_HOME (default: ~/loopany)

ARTIFACTS
  artifact create --kind <K> ...        Create new artifact
  artifact append <id> --section <S>    Append a section to body
  artifact status <id> <new-status>     Transition status
  artifact set <id> --<field> <value>   Edit a non-status frontmatter field
  artifact get <id>                     Read an artifact
  artifact list [--kind] [--status]     List artifacts

GRAPH
  refs <id> [--direction in|out|both] [--depth N]
                                        Query reference graph (BFS, depth N)
  refs add --from <id> --to <id> ...    Add a reference edge
  trace <id> [--direction backward|forward|both] [--relations csv]
                                        Walk causal predicates to fixed point

DOMAINS
  domain list                           List enabled + observed domains
  domain enable <name>                  Enable a domain
  domain disable <name>                 Disable a domain

SCHEDULING
  followups [--due today|overdue]       Find due check_at items

SEARCH
  reindex [--force] [--no-embed]        Rebuild hybrid search index from artifacts
  search <query> [--kind K] [--domain D] [--status S] [--limit N]
                                        Hybrid keyword + semantic search

UI
  factory [--port N] [--no-open]        Walkable pixel factory view of the workspace

SYSTEM
  kind list                             Show registered kinds
  doctor                                Check workspace integrity
  --version                             Print version

EXAMPLES
  Field flags are per-kind. To see exact fields for a kind, pass any
  unknown flag (e.g. \`--?\`) and the error lists valid flags. Common shapes:

    artifact create --kind goal    --title "..." --status active --content-file -
    artifact create --kind task    --title "[change] ..." --status todo --priority medium
    artifact create --kind signal  --summary "..." --source observability --domain ads
    artifact create --kind person  --slug self --name "Ada Lovelace" --emails ada@acme.example
    artifact create --kind note    --title "..." --content "..."

    refs add --from <id> --to <id> --relation mentions
    artifact status tsk-... done --reason "shipped"
`);
}

main();
