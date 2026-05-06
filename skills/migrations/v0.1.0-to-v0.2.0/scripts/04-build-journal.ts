#!/usr/bin/env bun
// Migration step 04 — backfill the `journal` kind from migrated artifacts.
//
// Reads every artifact under artifacts/<dirName>/ (skipping `journal/`
// itself), groups by `createdAt` date (YYYY-MM-DD), and writes one
// journal entry per active date at:
//
//   artifacts/journal/<YYYY>/<YYYY-MM-DD>.md
//
// Each entry has a `## Backfilled` section listing every artifact created
// that day as `- [[<id>]] — <title>`. The journal kind in v0.2 stores
// live (non-backfilled) entries in `## Activity` — this script only
// touches `## Backfilled`, so future live additions append safely under
// the other heading without merge conflicts.
//
// Idempotent: if a journal file already has a `## Backfilled` section, it
// gets fully replaced from the current artifact set. Anything outside
// that section (head, `## Activity`, user notes) is preserved.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  workspaceRoot,
  isApply,
  logHeader,
  parseMarkdown,
  serializeMarkdown,
  isoDate,
} from './_lib.ts';

interface JournalLine {
  id: string;
  title: string;
}

async function main(): Promise<void> {
  const apply = isApply();
  logHeader('04-build-journal', apply);

  const root = workspaceRoot();
  const artifactsDir = join(root, 'artifacts');
  if (!existsSync(artifactsDir)) {
    console.log('  no artifacts/ — nothing to journal');
    return;
  }

  // Collect (date, id, title) for every artifact except journal itself.
  const byDate = new Map<string, JournalLine[]>();
  const kindDirs = await readdir(artifactsDir, { withFileTypes: true });
  for (const kindDir of kindDirs) {
    if (!kindDir.isDirectory()) continue;
    if (kindDir.name === 'journal') continue;
    if (/^\d{4}-\d{2}$/.test(kindDir.name)) continue; // leftover v0.1 bucket — step 02 should have swept

    const dirPath = join(artifactsDir, kindDir.name);
    const files = await readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const path = join(dirPath, file);
      const st = await stat(path);
      if (!st.isFile()) continue;
      const raw = await readFile(path, 'utf-8');
      const { frontmatter } = parseMarkdown(raw);
      const id = file.slice(0, -3);
      const createdAt = frontmatter.createdAt;
      if (typeof createdAt !== 'string') {
        console.warn(`  ! ${path}: missing createdAt — skipped`);
        continue;
      }
      const date = isoDate(createdAt);
      const title =
        typeof frontmatter.title === 'string' ? frontmatter.title : '';
      const list = byDate.get(date) ?? [];
      list.push({ id, title });
      byDate.set(date, list);
    }
  }

  // Sort each day by id for deterministic output.
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  console.log('');
  console.log(`journal entries to write: ${byDate.size}`);
  for (const [date, lines] of [...byDate.entries()].sort()) {
    console.log(`  ${date}  (${lines.length} item${lines.length === 1 ? '' : 's'})`);
  }

  if (!apply) {
    console.log('(dry-run; journal not written)');
    return;
  }

  for (const [date, lines] of byDate.entries()) {
    const year = date.slice(0, 4);
    const dir = join(artifactsDir, 'journal', year);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${date}.md`);

    let head = '';
    let activitySection = '';
    if (existsSync(path)) {
      const raw = await readFile(path, 'utf-8');
      const { body } = parseMarkdown(raw);
      const split = splitOnBackfilled(body);
      head = split.before;
      activitySection = split.activity;
    } else {
      head = `# ${date}\n`;
    }

    const backfilledSection = renderBackfilled(lines);
    const newBody = stitch(head, activitySection, backfilledSection);
    const fm = {
      date,
      createdAt: `${date}T00:00:00.000Z`,
      updatedAt: `${date}T00:00:00.000Z`,
      _backfilled: true,
    };
    await writeFile(
      path,
      serializeMarkdown({ frontmatter: fm, body: newBody }),
      'utf-8',
    );
  }

  console.log(`wrote ${byDate.size} journal file(s) under artifacts/journal/`);
}

function renderBackfilled(lines: JournalLine[]): string {
  const items = lines.map((l) =>
    l.title ? `- [[${l.id}]] — ${l.title}` : `- [[${l.id}]]`,
  );
  return `## Backfilled\n\n${items.join('\n')}\n`;
}

function splitOnBackfilled(body: string): {
  before: string;
  activity: string;
} {
  // Strip an existing ## Backfilled section so we can rewrite it cleanly.
  const re = /^## Backfilled\s*$/m;
  const m = re.exec(body);
  if (!m) {
    // No prior Backfilled — keep everything as `before`. Try to also
    // capture an existing ## Activity for preservation.
    const actMatch = /^## Activity[\s\S]*$/m.exec(body);
    if (actMatch) {
      const before = body.slice(0, actMatch.index).replace(/\s+$/, '') + '\n';
      const activity = actMatch[0].replace(/\s+$/, '') + '\n';
      return { before, activity };
    }
    return { before: body.replace(/\s+$/, '') + '\n', activity: '' };
  }
  // Find the next H2 after Backfilled to know its end.
  const after = body.slice(m.index + m[0].length);
  const nextH2 = after.search(/^## /m);
  const tail = nextH2 === -1 ? '' : after.slice(nextH2);
  const beforeBackfilled = body.slice(0, m.index).replace(/\s+$/, '') + '\n';

  // The tail might contain Activity — preserve it.
  const actMatch = /^## Activity[\s\S]*$/m.exec(tail);
  if (actMatch) {
    return {
      before: beforeBackfilled,
      activity: actMatch[0].replace(/\s+$/, '') + '\n',
    };
  }
  return { before: beforeBackfilled + tail, activity: '' };
}

function stitch(before: string, activity: string, backfilled: string): string {
  const parts = [before.replace(/\s+$/, '')];
  if (activity) parts.push(activity.replace(/\s+$/, ''));
  parts.push(backfilled.replace(/\s+$/, ''));
  return parts.join('\n\n') + '\n';
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
