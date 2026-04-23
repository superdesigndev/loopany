---
name: loopany-improve
description: Reflect on recent `task` outcomes, dismissed signals, and rejected proposals to produce `learning` and `skill-proposal` artifacts. Use when the user asks to "reflect" / "improve yourself", on weekly or monthly cadence, or after ≥3 tasks flip to done.
---

# improve — reflect on outcomes, write learnings and skill-proposals

The self-iteration loop. Periodically you read recent `task` outcomes,
dismissed `signal`s, and previously rejected proposals — and decide whether
the evidence supports a new **belief** (`learning`) or a new **behavior
change** (`skill-proposal`).

You don't edit skill files. You propose. A separate human step (via the
`accept-proposal` skill) applies the diff.

## When to run this

- User asks: "reflect", "what have we learned", "improve yourself"
- Scheduled cadence (weekly / monthly, per the active goal's recap cadence)
- After a batch of completed tasks (≥ 3 `task` flipped to `done` in a short
  window)

**Don't run it reactively after every single task** — patterns need
multiple data points.

## Step 1 — Gather evidence

Use the CLI. All data you need is already there.

```bash
# Recent completed tasks — outcomes live in `## Outcome` sections
loopany artifact list --kind task --status done

# Active signals, especially the ones that recur
loopany artifact list --kind signal

# Dismissed signals — why did these get ignored?
loopany artifact list --kind signal --dismissed true

# Existing beliefs — are any of these now contradicted / extended?
loopany artifact list --kind learning --status active

# Previously rejected proposals — DO NOT re-suggest these
loopany artifact list --kind skill-proposal --status rejected
```

Filter to "recent" by looking at the ID prefix — task IDs are
`tsk-YYYYMMDD-HHMMSS`, so sorting + slicing is trivial.

For each candidate artifact, read the body:

```bash
loopany artifact get <id>
```

## Step 2 — Look for patterns

You're looking for **repeat signal**, not one-off correlations.

| Pattern | Evidence threshold |
|---------|--------------------|
| Same class of outcome (same phrase, same failure mode) | ≥ 3 tasks |
| A belief is refuted | ≥ 2 tasks where the old learning predicts wrong |
| A belief is extended | ≥ 2 tasks where the old learning needs a new caveat |
| A signal keeps getting dismissed but recurs | ≥ 3 dismissals over ≥ 2 weeks |

**Good examples**:

- Four `[change]` tasks all note "no baseline captured before shipping" in
  their `## Outcome` → **learning**: "change tasks without a before-number
  produce unfalsifiable outcomes." → **skill-proposal** (target:
  `skills/change-ledger.md`): "refuse to flip `[change]` task to `done`
  unless body contains `## Before` with at least one metric line."

- Three `telemetry` tasks all needed a cleanup PR after the first ship →
  **learning**: "telemetry changes compound — always budget a cleanup PR
  in the original plan." No skill-proposal needed yet; this is a belief
  that shapes *future* planning, not an existing skill to change.

**Bad examples** (don't do this):

- One task with a bad outcome → not a pattern, don't propose.
- Two tasks that are superficially similar but in different domains → not
  a pattern, they're just both tasks.
- A pattern you already proposed and got rejected → check `rejected`
  before suggesting again.

## Step 3 — Write a `learning` (if a belief is warranted)

```bash
loopany artifact create --kind learning \
  --title "Change tasks without a ## Before produce unfalsifiable outcomes" \
  --domain crewlet \
  --evidence "tsk-20260422-072256,tsk-20260422-072256-2,tsk-20260422-072257" \
  --mentions "gol-crewlet-ops-health,prs-self" \
  --check-at 2026-07-22 \
  --content "$(cat <<'EOF'
## Observation
Four `[change]` tasks (#450, #447, #451, #441) all flipped to `done` with
"no rigorous before/after numbers captured" in their Outcome. Without a
baseline number, we cannot tell whether the change moved the metric —
only that the change shipped.

## Evidence
- tsk-20260422-072256 — "No before/after cache_hit numbers captured."
- tsk-20260422-072256-2 — "No rigorous before/after token numbers captured per PR."
- tsk-20260422-072257 — "Observability stack shifted; no delta measured."

## Scope
Applies specifically to `[change]` tasks under the `crewlet` ops-health
goal. Does not apply to `[incident]` tasks (where the baseline is
"things are broken" and the outcome is "things work").

## Check-at
Revisit 2026-07-22 — if by then `[change]` tasks routinely carry
measurable before-numbers, this learning can be retired.
EOF
)"
```

**Key fields**:
- `--title` — a declarative sentence, the belief itself
- `--evidence` — list of artifact IDs; must be ≥ 2
- `--mentions` — always include the goal and `prs-self` per ops-health
  convention
- `--check-at` — pick a date 1-3 months out; you're committing to revisit

## Step 4 — Write a `skill-proposal` (if a behavior change is warranted)

Only if the learning implies a concrete skill edit. Many learnings stop at
"now I know"; they don't need a proposal.

```bash
loopany artifact create --kind skill-proposal \
  --title "Require ## Before in [change] tasks before flipping to done" \
  --target-skill "skills/change-ledger.md" \
  --change-type modify \
  --domain crewlet \
  --evidence "lrn-20260422-120000" \
  --mentions "gol-crewlet-ops-health,lrn-20260422-120000" \
  --check-at 2026-06-22 \
  --content "$(cat <<'EOF'
## Motivation
See learning lrn-20260422-120000 — change tasks routinely ship without a
baseline, making outcomes unfalsifiable.

## Proposed change
Target: `skills/change-ledger.md`

**Intent**: add a hard rule that any `[change]` task, when being flipped
to `status: done`, must have a `## Before` section with at least one
quantitative line (metric + number + units).

**Where in the file**: in the "Status transitions" section, under the
`done` transition notes, add a new bullet.

**Approximate new content**:

> Before calling `artifact status <id> done`, verify the body contains a
> `## Before` section with at least one `metric: value unit` line. If
> missing, the flip must be rejected with a message pointing to this rule.

This is a soft rule in the skill — not a CLI enforcement — because
different domains may want different evidence formats. The skill is the
place to codify "what counts as a before-number" for this domain.

## Expected effect
- Short term: friction on 1-2 upcoming `[change]` tasks that would have
  been flipped to done without a baseline. The friction is the point —
  it forces going back to capture the number, or downgrading the task to
  `cancelled`.
- 3 months out: review `lrn-20260422-120000` — did `[change]` tasks with
  Before-numbers land more falsifiable outcomes?

## Check-at
2026-06-22 — after ~4-6 change tasks have been done under the new rule,
assess whether outcome quality improved.
EOF
)"
```

### Proposal body format — MANDATORY sections

Every `skill-proposal` body must have:

1. **`## Motivation`** — cite the `learning` (and underlying artifacts)
   that drove this.
2. **`## Proposed change`** — describe the edit in natural language:
   - target file path
   - intent (one sentence)
   - where in the file (section / anchor)
   - approximate new content (or paraphrased removal / modification)
3. **`## Expected effect`** — what should change short-term and long-term.
4. **`## Check-at`** — why the date.

**Why natural language, not unified diff?** Two reasons:
- LLM-generated diffs with line numbers are brittle (context drift).
- Accept is a separate agent step — `skills/accept-proposal.md` reads the
  proposal, looks at the current skill file, and produces the real edit.
  The proposal describes intent; accept applies it.

## Step 5 — Link the proposal ← learning ← evidence

Already done via `--mentions` and `--evidence`, but double-check:

```bash
loopany refs <lrn-id>              # should show incoming from the spr
loopany refs <spr-id>              # should show outgoing to the lrn
```

If the learning supersedes an older one, add that edge explicitly:

```bash
loopany refs add --from lrn-NEW --to lrn-OLD --relation supersedes
loopany artifact status lrn-OLD superseded --reason "superseded by lrn-NEW"
```

## Anti-patterns

### ❌ Proposing without a learning

A `skill-proposal` without a backing `learning` has no evidence trail. The
proposal body's `## Motivation` must cite a `learning` (or, rarely, a
cluster of artifacts directly — but then you should have written the
learning first).

### ❌ One task, one learning

If you write a learning from a single data point, you're overfitting. Wait
for a pattern.

### ❌ Re-proposing a rejected change

Before writing any proposal, run:

```bash
loopany artifact list --kind skill-proposal --status rejected
```

Read the `## Outcome` of each rejected proposal. If your new proposal is
semantically the same, **don't write it**. Either the evidence has
genuinely changed (in which case cite the new evidence clearly and note
why it differs), or drop it.

### ❌ Editing the skill file directly

Never. The only path to a skill edit is: write proposal → user accepts →
`accept-proposal` skill applies the diff. Direct edits bypass the record
and the review.

### ❌ Learning as log entry

A `learning` is a belief with scope and a review date, not a diary. "We
shipped #450 and it worked" is an outcome, not a learning. The
corresponding learning is "prompt-cache stability compounds across
token-reduction changes" — a general statement the next task can use.

### ❌ Skipping `--check-at`

Every `learning` and accepted `skill-proposal` should have a future
review date. Without one, beliefs rot silently. `loopany followups --due
today` picks these up.

## Quick reference

```
Evidence → Pattern → learning → (optional) skill-proposal → (user) accept → skill file edit
```

Every arrow is an artifact creation; no arrow is a silent edit.
