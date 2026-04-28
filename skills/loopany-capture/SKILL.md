---
name: loopany-capture
description: "Auto-capture after substantive work concludes. Routes events (PR shipped, incident resolved, decision made, problem noticed) to the right loopany artifact kind with a quality gate. Should run proactively — check this skill at the end of every user-requested task. Triggers: after any substantive work, 'record this', 'log this outcome', PR shipped, incident resolved, decision made, problem noticed but deferred."
---

# loopany-capture — event-triggered artifact capture

After substantive work concludes, check whether to record it as a
loopany artifact. "Substantive" = produced evidence or a decision a
future reader would need to find.

## Event → Kind routing

| Event | Target kind | Read |
|-------|-------------|------|
| PR shipped / merged | `task` | `../loopany-core/kinds/task.md` |
| Incident resolved | `task` | `../loopany-core/kinds/task.md` |
| Problem noticed, not acting now | `signal` | `../loopany-core/kinds/signal.md` |
| Existing task outcome observed | append `## Outcome` | `../loopany-core/kinds/task.md § Playbook` |
| Decision made with rationale | `note` or `task --status done` | see flowchart below |

### Decision flowchart

- Resolved a pending signal? → `task --status done` + `addressed` edge
- Produced something shippable? → `task --status done` with `## Outcome`
- Reasoned preference / principle? → `note` titled "decided: X over Y because Z"
- Belief from ≥ 2 data points? → `learning` via `loopany-reflect`

Default `note` when unsure.

## Quality gate

Skip capture when:

- **Not observable** — feeling, not fact.
- **Already captured** — `loopany artifact list --contains "<phrase>"`. Match? Append.
- **Too small** — typo fix, whitespace, one-liner.
- **Speculation** — at most a `signal`, only if concrete.
- **Internal agent work** — grepping, reading, answering. Not a capture event.

Quick test: if you can't write a one-sentence `## Outcome`, skip the task.

## Subagent dispatch

Don't capture inline — it breaks focus and produces weaker artifacts:

1. **Filter** — main session runs the quality gate.
2. **Compose context** (3-5 sentences): what happened, why it matters,
   any numbers or artifact IDs in scope.
3. **Dispatch**: "Record this via loopany. Read `loopany-core` to pick
   the right kind. Return the artifact ID."
4. Subagent writes the artifact, returns ID.
5. Main session continues — no context switch.

If the host has no subagent primitive, capture inline but keep it tight.

## Anti-patterns

- ❌ Trigger on every message exchange → only at completed-work boundaries.
- ❌ Capture during work, not after → no Outcome yet.
- ❌ Skip the quality gate → noise artifacts pollute reflect.
- ❌ Inline capture in long sessions → use subagent pattern.
