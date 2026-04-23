// `loopany doctor [--format human|json]` — workspace integrity check.
//
// Checks (all deterministic; doctor stays integrity-only, no semantic guesses):
//   workspace        — bootstrap succeeded (path + kinds dir exist)
//   kinds            — every kind def parses cleanly
//   artifacts        — every frontmatter passes its kind's zod schema
//   references       — no dangling edges (both endpoints exist)
//   onboarding       — prs-self artifact + ≥1 active goal
//   goal coverage    — (warn) non-entity artifacts mention a goal
//   domain coverage  — (warn) artifact domains are in enabled_domains
//
// What doctor does NOT do: lexical / semantic scans of body content (e.g.
// "are there TODOs?"). That's a reflect-loop job — it needs LLM
// understanding, not regex.

import type { Engine } from '../core/engine.ts';
import { parseArgs } from './argv.ts';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  problems?: string[];
}

export interface DoctorReport {
  workspace: string;
  checks: CheckResult[];
  ok: boolean;
}

export async function runDoctor(engine: Engine, args: string[]): Promise<DoctorReport> {
  const { flags } = parseArgs(args);
  const _ = flags; // format flag handled by cli.ts caller

  const idx = await engine.index();
  const checks: CheckResult[] = [];

  // 1. Workspace + 2. Kinds (we got here, so both passed)
  checks.push({
    name: 'workspace',
    status: 'ok',
    detail: engine.root,
  });

  const kindNames = engine.registry.list().map((k) => k.kind).sort();
  checks.push({
    name: 'kinds',
    status: 'ok',
    detail: `${kindNames.length} loaded (${kindNames.join(', ')})`,
  });

  // 3. Artifact validation
  const artifactProblems: string[] = [];
  let totalArtifacts = 0;
  for (const meta of idx.all()) {
    totalArtifacts++;
    const def = engine.registry.get(meta.kind);
    if (!def) {
      artifactProblems.push(`${meta.id}: unknown kind ${meta.kind}`);
      continue;
    }
    const parse = def.frontmatterSchema.safeParse(meta.frontmatter);
    if (!parse.success) {
      artifactProblems.push(`${meta.id}: ${parse.error.errors[0]?.message ?? 'invalid frontmatter'}`);
    }
  }
  checks.push({
    name: 'artifacts',
    status: artifactProblems.length === 0 ? 'ok' : 'fail',
    detail:
      artifactProblems.length === 0
        ? `${totalArtifacts} total, all valid`
        : `${totalArtifacts} total, ${artifactProblems.length} INVALID`,
    problems: artifactProblems.length ? artifactProblems : undefined,
  });

  // 4. References integrity
  const refProblems: string[] = [];
  let totalEdges = 0;
  for (const meta of idx.all()) {
    for (const edge of idx.refsOut(meta.id)) {
      totalEdges++;
      if (!idx.byId(edge.to)) {
        refProblems.push(`dangling: ${edge.from} → ${edge.to} (${edge.relation})`);
      }
    }
  }
  // Also check edges whose `from` doesn't exist (shouldn't happen via CLI but possible if jsonl was hand-edited)
  const seen = new Set<string>();
  for (const meta of idx.all()) seen.add(meta.id);
  // Walk forward map directly via load (idx doesn't expose it cleanly; use refs)
  // Simpler: iterate refsIn for every artifact and look for unknown `from`
  for (const meta of idx.all()) {
    for (const edge of idx.refsIn(meta.id)) {
      if (!seen.has(edge.from)) {
        refProblems.push(`dangling: ${edge.from} → ${edge.to} (${edge.relation}) — source missing`);
      }
    }
  }
  checks.push({
    name: 'references',
    status: refProblems.length === 0 ? 'ok' : 'fail',
    detail:
      refProblems.length === 0
        ? `${totalEdges} edges, no dangling`
        : `${totalEdges} edges, ${refProblems.length} DANGLING`,
    problems: refProblems.length ? refProblems : undefined,
  });

  // 5. Onboarding
  const onboardingProblems: string[] = [];
  if (!idx.byId('prs-self')) {
    onboardingProblems.push('prs-self artifact missing — run onboarding (Phase 3 step 2)');
  }
  const activeGoals = idx.byKind('goal').filter((m) => m.frontmatter.status === 'active');
  if (activeGoals.length === 0) {
    onboardingProblems.push('no active goal — run onboarding (Phase 3 step 3)');
  }
  checks.push({
    name: 'onboarding',
    status: onboardingProblems.length === 0 ? 'ok' : 'fail',
    detail:
      onboardingProblems.length === 0
        ? `prs-self present, ${activeGoals.length} active goal(s)`
        : 'incomplete',
    problems: onboardingProblems.length ? onboardingProblems : undefined,
  });

  // Goal coverage — warning, not fail. Skipped if no goals exist (onboarding catches that).
  const goalIds = new Set(idx.byKind('goal').map((m) => m.id));
  if (goalIds.size > 0) {
    const orphans: string[] = [];
    for (const meta of idx.all()) {
      if (meta.kind === 'goal' || meta.kind === 'person') continue;
      const mentions = (meta.frontmatter.mentions as string[] | undefined) ?? [];
      if (!mentions.some((m) => goalIds.has(m))) {
        orphans.push(`${meta.id}: no goal mention`);
      }
    }
    checks.push({
      name: 'goal coverage',
      status: orphans.length === 0 ? 'ok' : 'warn',
      detail:
        orphans.length === 0
          ? 'all non-entity artifacts mention a goal'
          : `${orphans.length} artifact(s) without goal mention`,
      problems: orphans.length ? orphans : undefined,
    });
  }

  // Domain coverage — warn on artifacts whose domain is not in enabled_domains.
  const enabledSet = new Set(engine.config.enabledDomains());
  const domainOrphans: string[] = [];
  for (const meta of idx.all()) {
    const d = meta.frontmatter.domain;
    if (typeof d === 'string' && !enabledSet.has(d)) {
      domainOrphans.push(`${meta.id}: domain "${d}" not in enabled_domains`);
    }
  }
  checks.push({
    name: 'domain coverage',
    status: domainOrphans.length === 0 ? 'ok' : 'warn',
    detail:
      domainOrphans.length === 0
        ? `enabled: [${engine.config.enabledDomains().join(', ') || 'none'}]`
        : `${domainOrphans.length} artifact(s) using unenabled domain`,
    problems: domainOrphans.length ? domainOrphans : undefined,
  });

  const ok = checks.every((c) => c.status !== 'fail');
  return { workspace: engine.root, checks, ok };
}

export function formatReport(report: DoctorReport): string {
  const lines: string[] = [];
  for (const c of report.checks) {
    const mark = c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
    const name = capitalize(c.name).padEnd(14);
    lines.push(`${name}  ${c.detail} ${mark}`);
    if (c.problems) {
      for (const p of c.problems) lines.push(`                - ${p}`);
    }
  }
  return lines.join('\n') + '\n';
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
