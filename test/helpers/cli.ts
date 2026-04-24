import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const CLI_PATH = resolve(import.meta.dir, '..', '..', 'src', 'cli.ts');

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCli(workspace: string, ...args: string[]): Promise<CliResult> {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    env: { ...process.env, LOOPANY_HOME: workspace },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode ?? -1 };
}

export async function runCliWithStdin(
  workspace: string,
  stdin: string,
  ...args: string[]
): Promise<CliResult> {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    env: { ...process.env, LOOPANY_HOME: workspace },
    stdin: new Response(stdin).body ?? undefined,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr, code: proc.exitCode ?? -1 };
}

export function newWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'loopany-e2e-'));
}
