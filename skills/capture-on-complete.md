---
name: loopany-capture-on-complete
description: Decide whether and how to record work via loopany after a substantive event concludes — PR shipped, incident resolved, decision made, signal noticed, outcome observed. Routes to the right kind + downstream form skill, and specifies the subagent dispatch pattern.
---

# capture-on-complete — when + how to proactively record

The capture-discipline skill. Step 4 of INSTALL injects the 5 trigger
classes into every agent session's memory; this file has the routing
table, quality bar, and subagent dispatch pattern those triggers feed.

**Two entry points:**

- **Main session** reads this when it notices a trigger fired — to
  decide whether the event clears the quality bar and to compose the
  context package for the subagent.
- **Subagent** reads this (and its named form skill) to pick the right
  kind, write the artifact, and return the ID.

## When to trigger — 5 classes

| Trigger | Target kind | Form skill |
|---|---|---|
| **PR shipped / merged** | `task` — prefix `[change]` if the goal was to move a metric, `[incident]` if it was a fix | `skills/task-lifecycle.md` |
| **Incident resolved** | `task` with `[incident]` prefix | `skills/task-lifecycle.md` |
| **Decision made** with rationale worth preserving | `note` (default), or `task --status done` if the decision *was* the deliverable | inline guidance below |
| **Signal noticed** | `signal` | `skills/signal-capture.md` |
| **Outcome observed** on an existing task | **append** `## Outcome` to that task — do NOT create a new artifact | `skills/task-lifecycle.md` (§ Outcome) |

"Substantive" means the event produced evidence or a decision that a
future reader would need to find. Events that produced nothing citable
are not triggers.

## Quality bar — when to skip

Default **skip** when any of these hold:

- **Not observable** — you have a feeling, not a fact.
- **Already captured** — `loopany artifact list --contains "<phrase>"`
  first. If a match exists, **append** evidence to that one instead of
  creating a new artifact.
- **Too small** — typo fix, whitespace, one-line edit with no
  hypothesis.
- **Speculation, not result** — "we might want to X" is at most a
  `signal`, and only if concrete enough to cite later.
- **Internal agent work** — the agent grepped, read a file, answered a
  question: not a capture event.

Rough test: if you can't write a one-sentence `## Outcome`, you
shouldn't be creating a `task`.

## Subagent dispatch — the pattern

Main session does NOT write the artifact inline. Instead:

1. **Identify + filter.** Main session notices the trigger, runs the
   quality-bar check.
2. **Compose a compact context package** — 3-5 sentences:
   - What happened (concrete, observable)
   - Why it matters (ties to goal / unblocked X / surfaced Y)
   - Any before/after numbers, file paths, or artifact IDs already in scope
3. **Dispatch the subagent** with the context package plus the
   instruction:

   > "Record this as a loopany artifact. Consult
   > `~/loopany-src/skills/RESOLVER.md` and
   > `~/loopany-src/skills/capture-on-complete.md` to pick the right
   > kind and form skill. Return the artifact ID."

4. **Subagent executes**:
   - Reads the resolver + this file
   - Reads the chosen form skill (task-lifecycle / signal-capture / …)
   - Runs `loopany artifact create --kind <X> …` with proper frontmatter
     and body
   - Returns the new artifact ID
5. **Main session records the returned ID** in the running conversation
   and continues the original work — no context switch, no mid-work
   detour into writing.

Platform-specific spawn primitives:

| Host | Spawn verb |
|---|---|
| Claude Code | `Task` tool |
| Hermes | `delegate` primitive |
| OpenClaw | `spawn` with the agent profile |
| Codex | subagent invocation per your setup's convention |

The pattern is the same; the verb differs. If your host has no reliable
subagent primitive, you **may** capture inline, but keep it tight:
minimal body, return to main work ASAP, do not let capture bloat the
main session.

## "Decision made" — inline guidance

Decisions don't map neatly to task/signal. Fast flowchart:

- Did the decision **resolve** a pending signal? → `task --status done`
  that `addresses` the signal (relation verb: `addresses`)
- Did the decision **produce something shippable**? → `task --status done`
  with `## Outcome` describing the deliverable
- Is it a **reasoned preference / principle** now in force? → `note`
  titled "decided: X over Y because Z"
- Is it a **belief formed from ≥ 2 data points**? → that's a `learning`,
  not a one-off capture — use the `improve` skill instead

Default `note` when unsure. Notes are the safe kind.

## Anti-patterns

### ❌ Trigger on every message exchange

Writing an artifact after every Q&A turn pollutes the brain with
low-signal noise; `improve` then can't find patterns through it.
Trigger only at **completed-thing** boundaries.

### ❌ Skip the subagent, write inline

Tempting because "I already have the context". But inline capture
(a) breaks the main session's focus on the original task, and
(b) tends to produce weaker artifacts — the agent is still holding too
much unrelated context to write a clean Outcome.

### ❌ Capture during the work, not after

If the task isn't done yet, the artifact you write has no Outcome, so
the most important section is empty or speculative. Wait for the event
to actually conclude.

### ❌ Dispatch without running the quality bar

Subagent gets a malformed trigger → writes a noise artifact → pollutes
`improve`. The main session's filtering job is non-negotiable.

## Cross-refs

- Form skills: `skills/task-lifecycle.md`, `skills/signal-capture.md`,
  `skills/improve.md` (for learnings)
- Injected trigger summary in agent memory: `INSTALL_FOR_AGENTS.md`
  Step 4
- Resolver entry point: `skills/RESOLVER.md`
