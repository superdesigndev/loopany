// Full lifecycle scenario test — simulates a typical "agent + user" flow:
//
//   1. User: "follow up with Alice next Tuesday about the contract"
//   2. Agent records the inbound as a signal
//   3. Agent creates the person (if missing)
//   4. Agent creates a task with check_at + mentions
//   5. Agent links signal → task (led-to)
//   6. Tuesday: cron-via-/loop fires `followups --due today`
//   7. Agent picks up the task, does the work
//   8. Agent appends ## Outcome, flips status to done
//   9. Verify everything is queryable end-to-end

import { describe, expect, test } from 'bun:test';
import { runCli, newWorkspace } from './helpers/cli.ts';

describe('scenario: follow up with Alice', () => {
  test('full lifecycle from signal to done task', async () => {
    const ws = newWorkspace();
    await runCli(ws, 'init');

    // 1+2. Record the inbound as a signal
    const sigCreate = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'signal',
      '--title', 'User wants to follow up with Alice about contract',
    );
    expect(sigCreate.code).toBe(0);
    const sig = JSON.parse(sigCreate.stdout);

    // 3. Create the person
    const personCreate = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'person',
      '--slug', 'alice-chen',
      '--name', 'Alice Chen',
      '--aliases', 'alice,a.chen',
    );
    expect(personCreate.code).toBe(0);
    const alice = JSON.parse(personCreate.stdout);
    expect(alice.id).toBe('prs-alice-chen');

    // 4. Create the task with a past check_at so it's already due
    const taskCreate = await runCli(
      ws, 'artifact', 'create',
      '--kind', 'task',
      '--title', 'Follow up with Alice on contract',
      '--status', 'todo',
      '--priority', 'high',
      '--check-at', '2020-01-01',
      '--mentions', alice.id,
    );
    expect(taskCreate.code).toBe(0);
    const task = JSON.parse(taskCreate.stdout);

    // 5. Link signal → task (led-to)
    await runCli(ws, 'refs', 'add', '--from', sig.id, '--to', task.id, '--relation', 'led-to');
    // Also link task → alice (mentions)
    await runCli(ws, 'refs', 'add', '--from', task.id, '--to', alice.id, '--relation', 'mentions');

    // 6. followups picks up the due task
    const due = await runCli(ws, 'followups', '--due', 'today');
    expect(due.code).toBe(0);
    const dueItems = JSON.parse(due.stdout);
    expect(dueItems.map((m: { id: string }) => m.id)).toContain(task.id);

    // 7. Move to running, then back to in_review
    await runCli(ws, 'artifact', 'status', task.id, 'running');
    await runCli(ws, 'artifact', 'status', task.id, 'in_review');

    // 8. Append outcome and flip to done
    await runCli(
      ws, 'artifact', 'append', task.id,
      '--section', 'Outcome',
      '--content', 'Alice signed today; contract effective 2026-04-29.',
    );
    const done = await runCli(ws, 'artifact', 'status', task.id, 'done', '--reason', 'signed');
    expect(done.code).toBe(0);

    // 9. Verify end state
    const final = await runCli(ws, 'artifact', 'get', task.id, '--format', 'json');
    const finalObj = JSON.parse(final.stdout);
    expect(finalObj.frontmatter.status).toBe('done');
    expect(finalObj.body).toContain('## Outcome');
    expect(finalObj.body).toContain('Alice signed today');

    // Refs round-trip
    const sigOut = JSON.parse((await runCli(ws, 'refs', sig.id)).stdout);
    expect(sigOut[0].to).toBe(task.id);

    const aliceIn = JSON.parse((await runCli(ws, 'refs', alice.id, '--direction', 'in')).stdout);
    expect(aliceIn.find((e: { from: string }) => e.from === task.id)).toBeDefined();

    // List filter: tasks with status=done
    const doneList = JSON.parse(
      (await runCli(ws, 'artifact', 'list', '--kind', 'task', '--status', 'done')).stdout,
    );
    expect(doneList).toHaveLength(1);
    expect(doneList[0].id).toBe(task.id);
  });
});
