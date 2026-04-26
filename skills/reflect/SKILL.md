---
name: loopany-reflect
description: Use when the user says "reflect" / "what have we learned" / "improve yourself", on weekly cadence, or after ≥3 `task`s flip to done in a short window. Reads recent outcomes + dismissed signals + rejected proposals, writes `learning` and (optionally) `skill-proposal` artifacts. Also use when writing a `learning` or `skill-proposal` from any source. The self-iteration loop.
---

# reflect — on outcomes, write learnings and skill-proposals

Read recent `task` outcomes, dismissed `signal`s, and previously rejected
proposals; decide whether the evidence supports a new **belief**
(`learning`) or a new **behavior change** (`skill-proposal`).

You don't edit skill files. You propose; the user reads the proposal and
applies the change. The proposal is the contract.

## When to run this

- User asks: "reflect", "what have we learned", "improve yourself"
- Scheduled cadence: weekly (monthly structural/mission review lives in
  [[monthly-review/SKILL.md]])
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
loopany artifact list --kind signal --status dismissed

# Existing beliefs — are any of these now contradicted / extended?
loopany artifact list --kind learning --status active

# Previously rejected proposals — don't re-suggest these
loopany artifact list --kind skill-proposal --status rejected
```

Filter to "recent" by looking at the ID prefix — task IDs are
`tsk-YYYYMMDD-HHMMSS`, so sorting + slicing is trivial. Default window:
one cadence-interval's worth (≈ a week for weekly cadence).

Then **filter out what's already been processed.** An artifact already
cited as `--evidence` in an active `learning` or non-rejected
`skill-proposal` has already informed someone's belief — re-examining
it for the same pattern just produces duplicates.

```bash
# Collect cited evidence IDs from both kinds
loopany artifact list --kind learning --status active
loopany artifact list --kind skill-proposal         # excluding rejected
```

Read each result's `evidence` field, union the IDs, subtract from your
candidate set. What's left is **fresh, uncited evidence** — material
that hasn't yet shaped any belief.

**Exception — revalidating an existing belief.** When a `learning`'s
own `check_at` fires, its evidence is relevant again — but that
revisit belongs in [[daily-followups/SKILL.md]], not here. reflect looks
forward; daily-followups looks back at specific beliefs on schedule.

For each remaining candidate, read the body:

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

- Four tasks with expected metric effects all note "no baseline captured
  before shipping" in their `## Outcome` → **learning**: "tasks with
  measurable expected effects but no baseline produce unfalsifiable
  outcomes." → **skill-proposal** (target:
  `skills/core-artifacts/SKILL.md`): "when a task claims a measurable
  expected effect, require or strongly prompt for `## Before` before done."

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
  --title "Tasks with measurable expected effects but no baseline produce unfalsifiable outcomes" \
  --domain ads \
  --evidence "tsk-20260422-072256,tsk-20260422-072256-2,tsk-20260422-072257" \
  --mentions "mis-ads-ops-health" \     # this learning directly informs the mission
  --check-at 2026-07-22 \
  --content "$(cat <<'EOF'
## Observation
Four tasks (#450, #447, #451, #441) claimed or implied measurable effects
but flipped to `done` with "no rigorous before/after numbers captured" in
their Outcome. Without a baseline number, we cannot tell whether the work
moved the metric — only that it shipped.

## Evidence
- tsk-20260422-072256 — "No before/after cache_hit numbers captured."
- tsk-20260422-072256-2 — "No rigorous before/after token numbers captured per PR."
- tsk-20260422-072257 — "Observability stack shifted; no delta measured."

## Scope
Applies specifically to tasks under the `ads` ops-health mission that claim
or imply a measurable effect. Does not apply to purely qualitative or
exploratory tasks where no useful metric exists.

## Check-at
Revisit 2026-07-22 — if by then metric-oriented tasks routinely carry
measurable before-numbers, this learning can be archived.
EOF
)"
```

**Key fields**:
- `--title` — a declarative sentence, the belief itself
- `--evidence` — list of artifact IDs; must be ≥ 2
- `--mentions` — cite supporting artifacts, and any mission this learning
  directly informs (see `kinds/mission.md` — don't add a mission reflexively)
- `--check-at` — pick a date 1-3 months out; you're committing to revisit

## Step 4 — Write a `skill-proposal` (if a behavior change is warranted)

Only if the learning implies a concrete skill edit. Many learnings stop at
"now I know"; they don't need a proposal.

```bash
loopany artifact create --kind skill-proposal \
  --title "Require ## Before for metric-oriented tasks before flipping to done" \
  --target-skill "skills/core-artifacts/SKILL.md" \
  --change-type modify \
  --domain ads \
  --evidence "lrn-20260422-120000" \
  --mentions "mis-ads-ops-health,lrn-20260422-120000" \
  --check-at 2026-06-22 \
  --content "$(cat <<'EOF'
## Motivation
See learning lrn-20260422-120000 — metric-oriented tasks routinely ship
without a baseline, making outcomes unfalsifiable.

## Proposed change
Target: `skills/core-artifacts/SKILL.md`

**Intent**: add a rule that any task claiming a measurable expected effect,
when being flipped to `status: done`, must have a `## Before` section with
at least one quantitative line (metric + number + units), or explicitly say
no useful baseline exists.

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
- Short term: friction on 1-2 upcoming metric-oriented tasks that would
  have been flipped to done without a baseline. The friction is the point:
  capture the number, or explicitly record why no baseline exists.
- 3 months out: review `lrn-20260422-120000` — did metric-oriented tasks
  with Before-numbers land more falsifiable outcomes?

## Check-at
2026-06-22 — after ~4-6 metric-oriented tasks have been done under the new
rule, assess whether outcome quality improved.
EOF
)"
```

### Proposal body format — required sections

Every `skill-proposal` body must have these — without them the accept
step has nothing to translate into a real edit:

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
- Accept is a separate human step — the user reads the proposal, looks
  at the current skill file, and produces the real edit. The proposal
  describes intent; accept applies it.

### When `change_type: add` — proposing a brand-new skill

A new skill is a **directory** with a `SKILL.md`, per the Anthropic
Agent Skills format. **Default assumption: extend an existing skill.**
Only propose `add` when no existing skill cleanly fits.

Three differences from `modify`:

- `--target-skill` is the to-be-created path, e.g.
  `skills/<new-name>/SKILL.md`. Pick `<new-name>` from the skill's
  identity (kebab-case verb or noun), not from the proposal title.
- `## Proposed change` must **name which existing skills were
  considered and why each was rejected** as a host. "It didn't fit"
  isn't enough; name the skill, name the section, name the mismatch.
- The body adds two extra required sections:
  - **`## Skill draft`** — full SKILL.md to create (YAML frontmatter +
    body). Frontmatter must include `name` and `description`. The
    description states what the skill does AND when to trigger, in
    **"pushy" form** to combat undertrigger. **Trigger phrasing must
    mirror what the user would actually type**, not internal jargon —
    "review the deploy" beats "execute deployment verification protocol".
  - **`## Resolver entry`** — the row to add to `skills/RESOLVER.md`
    (trigger column → `[[<new-name>/SKILL.md]]`). Without this row, the
    scaffolded skill is unreachable. Reuse the same trigger phrases as
    the description; both must mirror real user language.

Example tail of the body:

```markdown
## Proposed change
Target: `skills/dedup-evidence/SKILL.md` (new).

Existing skills considered:
- `reflect/SKILL.md` — dedup is invoked from any evidence-citing path,
  not only reflect. Burying it inside reflect hides it from
  `core-artifacts` callers.
- `core-artifacts/SKILL.md` — adding cross-kind dedup logic would
  dilute its "one kind per section" structure.

Stands alone so any caller can `[[dedup-evidence/SKILL.md]]`.

## Skill draft
\`\`\`markdown
---
name: loopany-dedup-evidence
description: Use whenever you're about to cite artifacts as `--evidence`
on a `learning` or `skill-proposal`. Filters out IDs already cited by
active learnings or non-rejected proposals so the same data point doesn't
shape two beliefs. Make sure to use this even on small batches —
duplicates compound silently.
---

# dedup-evidence — strip already-cited IDs from a candidate set
…
\`\`\`

## Resolver entry
\`\`\`
| "about to cite evidence" / "before I add evidence" / writing `--evidence` | [[dedup-evidence/SKILL.md]] |
\`\`\`
```

## Step 5 — Link the proposal ← learning ← evidence

Already done via `--mentions` and `--evidence`, but double-check the
full chain in one call:

```bash
loopany trace <spr-id> --direction backward
# spr → lrn → tasks/signals — all in one signed-distance timeline
```

If anything is missing, the proposal's motivation can't be reconstructed
from the graph alone. Add the missing edge before moving on.

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

Never. The only path is: write proposal → user reads → user (or an
agent the user dispatches) applies the change. Direct edits bypass the
record.

### ❌ Proposing `add` without a `## Resolver entry`

The scaffolded skill is unreachable — `RESOLVER.md` is the only
dispatcher entry point. A skill that's not listed there is dead code.

### ❌ Trigger phrases written in jargon

Both the `description` and the `## Resolver entry` triggers must mirror
real user language. "Review the deploy" beats "execute deployment
verification protocol". A phrase the user never types is a phrase that
never fires.

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
