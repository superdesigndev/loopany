---
name: loopany-reflect
description: "Self-improvement loop for loopany. Reads recent task outcomes + dismissed signals, discovers patterns, writes learning and skill-proposal artifacts. Also handles accepting/rejecting proposals. Triggers: 'reflect', 'what have we learned', 'improve yourself', ≥3 tasks done recently, 'accept spr-…', 'reject spr-…', 'review proposals', writing a learning or skill-proposal from any source."
---

# loopany-reflect — self-improvement loop

Two modes: **reflect** (discover patterns → write learnings + proposals)
and **proposal-apply** (accept or reject a pending proposal).

---

## Part 1: Reflect

### When to run

- User asks: "reflect", "what have we learned", "improve yourself"
- Weekly cadence (monthly structural review → `loopany-review`)
- After ≥ 3 tasks flip to `done` in a short window

**Don't run reactively after every single task.**

### Step 1 — Gather evidence

```bash
loopany artifact list --kind task --status done
loopany artifact list --kind signal
loopany artifact list --kind signal --status dismissed
loopany artifact list --kind learning --status active
loopany artifact list --kind skill-proposal --status rejected
```

Filter to recent by ID prefix (`tsk-YYYYMMDD-HHMMSS`). Default window ≈ 1 week.

**Filter out already-processed evidence.** Union `evidence` fields from
active learnings and non-rejected proposals → subtract from candidates.

**Exception**: `learning` revalidation on `check_at` belongs in
`loopany-review § Daily`, not here. Reflect looks forward; daily review
looks back.

For each fresh candidate: `loopany artifact get <id>`

### Step 2 — Look for patterns

| Pattern | Threshold |
|---------|-----------|
| Same class of outcome | ≥ 3 tasks |
| A belief is refuted | ≥ 2 tasks where old learning predicts wrong |
| A belief needs a caveat | ≥ 2 tasks |
| Signal keeps being dismissed but recurs | ≥ 3 dismissals over ≥ 2 weeks |

**Good**: 4 metric tasks without baselines → learning about unfalsifiable outcomes → proposal to require `## Before`.
**Bad**: 1 bad outcome → not a pattern. Already-rejected proposal → don't re-suggest.

### Step 3 — Write a learning

→ See `../loopany-core/kinds/learning.md § Playbook` for schema.

```bash
loopany artifact create --kind learning \
  --title "<declarative belief sentence>" \
  --evidence "tsk-...,tsk-..." \
  --mentions "mis-..." \
  --check-at 2026-07-22 \
  --content "$(cat <<'EOF'
## Observation
<what you saw across evidence>

## Evidence
- tsk-xxx — "<outcome summary>"
- tsk-yyy — "<outcome summary>"

## Scope
<when this applies and doesn't>

## Check-at
<why this date; what question to answer>
EOF
)"
```

Key fields: title = belief itself, evidence ≥ 2 IDs, check_at 1-3 months.

### Step 4 — Write a skill-proposal (if warranted)

Only if the learning implies a concrete skill edit. Many learnings stop
at "now I know."

→ See `../loopany-core/kinds/skill-proposal.md` for schema.

Required body sections:
1. `## Motivation` — cite the learning
2. `## Proposed change` — target file, intent, location, approximate content
3. `## Expected effect` — short-term and long-term
4. `## Check-at` — why this date

**When `change_type: add`** (new skill):
- `--target-skill` = to-be-created path
- `## Proposed change` must name existing skills considered and why rejected
- Add `## Skill draft` (full SKILL.md with frontmatter) + `## Resolver entry`

### Step 5 — Verify evidence chain

```bash
loopany trace <spr-id> --direction backward
```

If learning supersedes an older one:
```bash
loopany refs add --from lrn-NEW --to lrn-OLD --relation supersedes
loopany artifact status lrn-OLD superseded --reason "superseded by lrn-NEW"
```

---

## Part 2: Proposal Apply

### When to run

- "accept spr-...", "reject spr-...", "let's take that proposal"
- Batch review of pending proposals

```bash
loopany artifact list --kind skill-proposal --status pending
```

### Accept flow

1. Read proposal: `loopany artifact get <spr-id>`
2. Read cited learning: `loopany refs <spr-id> --direction out --relation mentions`
3. Read current target file
4. Apply edit faithfully — only the described change
5. Append `## Outcome` to proposal (what literally changed, interpretations)
6. Flip status: `loopany artifact status <spr-id> accepted --reason "..."`
7. Git commit: target file + proposal together

### Reject flow

1. Read proposal
2. Append `## Outcome` with reason — future reflect reads this
3. Flip status: `loopany artifact status <spr-id> rejected --reason "..."`

### Edge cases

- Target file doesn't exist → reject
- Cited learning superseded → reject
- Multiple proposals same file → accept one at a time, re-read between

---

## Anti-patterns

- ❌ Reflecting on single task — not a pattern.
- ❌ Skipping fresh-evidence filter — produces duplicates.
- ❌ Proposing without a learning — no evidence trail.
- ❌ Re-suggesting rejected proposal — check list first.
- ❌ `add` without `## Resolver entry` — dead code.
- ❌ Trigger phrases in jargon — mirror real user language.
- ❌ Editing skill file directly — always go through proposals.
- ❌ Editing beyond proposal scope — the proposal is the contract.
- ❌ Accept without reading learning — can't verify scope.
- ❌ Empty Outcome on accept/reject.

## Quick reference

```
REFLECT:  evidence → pattern → learning → (optional) proposal → user accept → edit
ACCEPT:   read spr → read lrn → read target → edit → Outcome → status → commit
REJECT:   read spr → Outcome (with reason) → status
```
