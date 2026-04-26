---
name: loopany-core-artifacts
description: Core artifact map and lifecycle rules for `signal` (deferred/unverified attention), `task` (committed work with an outcome), and `learning` (scoped belief from evidence). Briefly covers note, mission, brief, person, and skill-proposal routing. Use for choosing a core kind, writing signal/task bodies, promoting signal->task, and closing tasks with `## Outcome`. Usually read after [[proactive-capture/SKILL.md]] routes you here.
---

# core artifacts

`signal` = noticed but deferred or unverified.
`task` = committed work that must close with evidence.
`learning` = scoped belief derived from multiple artifacts.

[[reflect/SKILL.md]] reads these later. Prefer fewer, stronger artifacts: concrete
observations, explicit reasons, and honest outcomes.

## Core kind map

| Kind | Use when | Detailed skill |
|---|---|---|
| `signal` | Something concrete is noticed, but deferred or unverified | this file |
| `task` | Someone is committing to work or closing work with an outcome | this file |
| `learning` | A pattern across artifacts supports a scoped belief | [[reflect/SKILL.md]] |
| `skill-proposal` | A learning implies a concrete skill behavior change | [[reflect/SKILL.md]] (user reviews + applies) |
| `mission` | Long-running pursuit the agent should advance over time | kind file + [[monthly-review/SKILL.md]] |
| `brief` | Point-in-time summary for the user | kind file + [[relations/SKILL.md]] for `cites` |
| `note` | Free-form fallback; rationale, research, or one-off document | [[new-concept/SKILL.md]] |
| `person` | Human entity with aliases/contact timeline | kind file |

This file gives full discipline for `signal` and `task`, plus a short guard
for `learning`. For new domain-specific entities, use
[[new-concept/SKILL.md]].

## Decision rule

| State | Artifact |
|---|---|
| Acting now / committed to act | `task` |
| Deferred, blocked, or pending confirmation | `signal` |
| Pattern-backed belief from multiple artifacts | `learning` via [[reflect/SKILL.md]] |
| Belief implies a skill edit | `skill-proposal` via [[reflect/SKILL.md]] |
| Long-running standing intention | `mission` |
| Point-in-time summary | `brief` |
| Human entity | `person` |
| Pure observation with no unresolved action | nothing, or `note` if rationale matters |
| Belief without concrete evidence | wait for a pattern |
| Duplicate of an existing artifact | append evidence; don't fork |

The boundary that matters: **acting now -> `task`**. **Deferred or
unverified -> `signal`**.

---

# Signal

Create a `signal` only when all gates pass:

- **Concrete observable**: file path, session ID, PostHog event, commit,
  conversation, customer report.
- **Actionable in principle**: a plausible future task could address it.
- **Not already captured**: search first.
- **Not being acted on now**: if you are committing, create a `task`.

```bash
loopany artifact list --kind signal --contains "<key phrase>"
```

Near-match existing signal? Append evidence to it. Recurrence must stay
visible in one place.

## Fields

`title` is the searchable handle:

- 160 chars or less.
- Lead with the failure mode or symptom.
- Name the concrete thing: file path, tool, PR, event, integration.

```yaml
# Good
title: "upload_image base64-encodes video -> >5MB -> PayloadTooLargeError"

# Too vague
title: "video uploads sometimes fail"
```

Body is optional. Add it when future context matters:

```markdown
Observed <when/where>. <mechanism in 1-2 sentences>.

**Risk:** <cost|stability|data-loss|etc.>
**Fix direction (not yet a task):** <sentence>.
```

Keep signal bodies cite-worthy. They are not scratch pads.

## Closing signals

Use `addressed` when a responsible artifact resolved it; usually after a
task reaches `done` with Outcome:

```bash
loopany artifact status <sig-id> addressed --addressed-by <artifact-id>
```

Use `dismissed` when closing without action:

- False positive after investigation.
- Duplicated by a stronger signal you are keeping.
- Underlying condition went away.

Always include a reason. Dismissed signals are still evidence.
For recurrences, append; don't fork. Promote to `task` when recurrence
reaches 3 times in 2 weeks, or sooner if risk becomes urgent.

---

# Task

A `task` means "I'm doing this." Check for an existing task first:

```bash
loopany artifact list --kind task --contains "<key phrase>"
```

Near-duplicate in `todo` or `running`? Append or link with `follows-up`;
don't fork the thread.

## Body

```markdown
## Outcome
<What happened, final state, and any lesson or follow-up.>
```

`## Outcome` is required before `done` or `failed`. It should answer:

- What shipped, changed, or was decided?
- Is the issue fixed, or did the attempt fail?
- If there was an expected effect, did the observable evidence move?
- What would you do differently?

Optional sections are allowed when they make the Outcome easier to judge:

- `## Before` for baseline evidence.
- `## Plan` or `## Fix` for work notes.
- `## Follow-up` for loose threads that are not yet a next task or a
  learning.

Failed or neutral results are still useful evidence. Say so directly.

## Status

| Status | Meaning | Requirement |
|---|---|---|
| `todo` | Not started | none |
| `running` | Started | don't use as a parking lot |
| `in_review` | PR open or waiting externally | use instead of long-running blocked `running` |
| `done` | Delivered or shipped | `## Outcome` required |
| `failed` | Attempted, did not work, giving up | `## Outcome` required |
| `cancelled` | Decided not to do or abandoned | reason required; minimal Outcome if mid-flight |

Do not convert failed work into `cancelled` to keep the list clean.

Terminal gate:

```bash
loopany artifact append <id> --section Outcome --content "..."
loopany artifact status <id> <done|failed> --reason "<one line>"
```

## `check_at`

Set `check_at` only when there is a concrete future question to answer.
It is read by `loopany followups --due today`.

Missing `check_at` is better than a date with no review question.

---

# Learning

A `learning` is a belief with scope and evidence, not a log entry. Write
one only when a pattern is supported by multiple artifacts; one bad task is
not enough.

Use [[reflect/SKILL.md]] for full writing rules. Minimum discipline:

- Title is the belief itself, as a declarative sentence.
- `evidence` cites the tasks, signals, or proposals that support it.
- Body should cover `## Observation`, `## Evidence`, `## Scope`, and
  `## Check-at`.
- `check_at` should usually be 1-3 months out, with a concrete revalidation
  question.
- When understanding changes, create a new learning with `supersedes`; do
  not rewrite the old one.

A learning may stop at "now we know." Create a `skill-proposal` only when
the belief implies a concrete skill edit.

---

# Relations

## Signal -> task

When a signal becomes work, create a task but leave the signal `open`.
After the task closes with Outcome:

```bash
loopany artifact status sig-... addressed --addressed-by tsk-...
```

This flips the signal and writes `tsk-... addresses sig-...`.

## Task -> task

Use `follows-up` when a new task continues a prior task:

```bash
loopany refs add --from tsk-future --to tsk-today --relation follows-up
```

Use `follows-up` for continuation. Use `addresses` for task -> signal.
See [[relations/SKILL.md]].

## Task -> produced entity

Tasks are work-with-an-outcome. Tweets, posts, customers, orders, papers,
PRs, and episodes are entities that exist in the world. Represent them as
`note` or a custom kind via [[new-concept/SKILL.md]], then link from the
task with `produced` when needed.

---

# Anti-patterns

Avoid:

- Just-in-case signals with weak evidence.
- Signals used as scratch pads.
- Vague titles like "announce lock issue".
- Dismissal without a reason.
- Duplicate signals instead of appended recurrence evidence.
- Same-day Outcomes for metrics that need time to settle.
- Outcomes that say only "Shipped. It works."
- Keeping externally blocked or abandoned work in `running`.
- Using `task` as an entity holder.
- One task -> one learning; wait for a pattern.
- Learning as a diary entry instead of a scoped belief.
- Learning without `check_at`.

---

# Command snippets

Create a signal:

```bash
loopany artifact create --kind signal \
  --title "<one-line observable>" \
  --domain <domain> \
  --mentions "<entity-ids>" \
  --content "$(cat <<'EOF'
Observed <when/where>. <mechanism in 1-2 sentences>.

**Risk:** <cost|stability|data-loss|etc.>
**Fix direction (not yet a task):** <sentence>.
EOF
)"
```

Append recurrence:

```bash
loopany artifact append sig-... --section "Recurrences" \
  --content "2026-04-22: seen again in session X. Same mechanism."
```

Mark a signal addressed:

```bash
loopany artifact status <sig-id> addressed --addressed-by <tsk-id>
```

Dismiss a signal:

```bash
loopany artifact status <sig-id> dismissed --reason "..."
loopany artifact append <sig-id> --section "Dismissal" --content "..."
```

Create a scheduled task:

```bash
loopany artifact create --kind task \
  --title "<...>" \
  --status todo \
  --check-at 2026-05-13
```

Close a task:

```bash
loopany artifact append <id> --section Outcome --content "..."
loopany artifact status <id> done --reason "<one line>"
```
