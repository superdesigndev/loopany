---
name: loopany-proactive-capture
description: Use immediately after substantive work concludes in a loopany-enabled session — PR shipped, incident resolved, decision made, problem noticed but not yet acted on, outcome observed. Routes to the right kind, then hands off to [[./conventions/core-artifacts.md]] (signal/task body discipline) or [[./reflect.md]] (learnings). Specifies the subagent dispatch pattern. Main session reads to filter; subagent reads to write.
---

# proactive-capture — record after work concludes

The routing table + quality bar + subagent dispatch pattern for writing
the right artifact after a "substantive thing just finished."

**Two entry points:**

- **Main session** — notices a trigger fired, runs the quality bar, and
  composes the context package for the subagent.
- **Subagent** — reads this + the named form skill, picks the right
  kind, writes the artifact, returns the ID.

## When to trigger — 5 classes

| Trigger | Target kind | Body discipline |
|---|---|---|
| **PR shipped / merged** | `task` — prefix `[change]` if the goal was to move a metric, `[incident]` if it was a fix | [[./conventions/core-artifacts.md]] § Tasks |
| **Incident resolved** | `task` with `[incident]` prefix | [[./conventions/core-artifacts.md]] § Tasks |
| **Decision made** with rationale worth preserving | `note` (default), or `task --status done` if the decision *was* the deliverable | inline guidance below |
| **Problem/need noticed, not acting now** (or pending confirmation) | `signal` | [[./conventions/core-artifacts.md]] § Signals |
| **Outcome observed** on an existing task | **append** `## Outcome` to that task — don't create a new artifact | [[./conventions/core-artifacts.md]] § Outcome |

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

Main session does not write the artifact inline. Why: inline capture
breaks the main session's focus, and the main session is still holding
unrelated context that bleeds into a weaker Outcome. Hand off instead:

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
   > `~/loopany-src/skills/proactive-capture.md` to pick the right
   > kind and form skill. Return the artifact ID."

4. **Subagent executes**:
   - Reads the resolver + this file
   - Reads [[./conventions/core-artifacts.md]] for signal/task body shape
     (or [[./reflect.md]] for learnings)
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
  not a one-off capture — use the `reflect` skill instead

Default `note` when unsure. Notes are the safe kind.

## Anti-patterns

### ❌ Trigger on every message exchange

Writing an artifact after every Q&A turn pollutes the brain with
low-signal noise; `reflect` then can't find patterns through it.
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
`reflect`. The main session's filtering job exists for a reason.

## Cross-refs

- Body discipline: [[./conventions/core-artifacts.md]] (signal + task lifecycle)
- Learnings / proposals: [[./reflect.md]]
- Injected trigger summary in agent memory: `INSTALL_FOR_AGENTS.md` Step 4
- Resolver entry point: [[./RESOLVER.md]]
