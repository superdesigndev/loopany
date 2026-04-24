---
name: loopany-proposal-review
description: Use when accepting or rejecting a `skill-proposal` — triggers include "accept spr-…", "reject spr-…", "let's take that proposal", "ok do it" after seeing a proposal body, or batch-walking pending proposals. Accept = edit target skill + git commit; reject = record reason. The other half of the self-iteration loop, paired with [[./reflect.md]].
---

# proposal-review — accept or reject a `skill-proposal`

The other half of the self-iteration loop. When the user has decided what
to do with a pending `skill-proposal`, this skill applies the decision.

**Accepting** = edit the target skill file + commit + record what changed.
**Rejecting** = record why + move on.

Either way, the proposal artifact captures the full trail — future
`reflect` runs read it to avoid re-suggesting the same thing.

## When to run this

- User says: "accept spr-...", "reject spr-...", "let's take that proposal"
- User says: "ok do it" after showing them a proposal body
- Batch review: user wants to walk through pending proposals

Check pending first:

```bash
loopany artifact list --kind skill-proposal --status pending
```

## Accept flow

### Step 1 — Read the proposal in full

```bash
loopany artifact get <spr-id>
```

You are looking at:
- `target_skill` (frontmatter) — the file to edit
- `## Motivation` — why this change; cross-reference to the `learning`
- `## Proposed change` — natural-language description of the edit
- `## Expected effect` — what should change

If the proposal cites a learning, read it too:

```bash
loopany refs <spr-id> --direction out --relation mentions
loopany artifact get <lrn-id>
```

### Step 2 — Read the current target skill file

```bash
cat <target_skill_path>
```

Understand the existing structure. The proposal's "Proposed change"
describes intent; you translate that into a concrete edit in the actual
file layout.

### Step 3 — Apply the edit faithfully

**Scope**: make only the change described. Don't refactor surrounding
text. Don't "improve" the skill while you're there.

**If the proposal is ambiguous** (intent clear, exact location or
wording unclear): pick the interpretation most consistent with the
learning's scope, and note your interpretation in the `## Outcome`
section. Don't ask the user mid-flow unless the proposal is actively
contradictory.

**If the proposal is literally impossible** (target file doesn't have
the section it's supposed to edit, or the edit conflicts with text
added since): stop, don't edit, and escalate to reject with reason
"no longer applies".

### Step 4 — Record the outcome on the proposal

Before flipping status, the proposal body must contain `## Outcome` (the
kind's status machine enforces this on `accepted`).

```bash
loopany artifact append <spr-id> --section Outcome --content "$(cat <<'EOF'
Applied 2026-04-22. Edited skills/change-ledger.md:

- Added bullet under "Status transitions → done":
  "Before `artifact status <id> done`, verify body contains `## Before`
  with at least one `metric: value unit` line."

Interpretation notes:
- The proposal said "hard rule"; I implemented it as a skill-level hard
  rule (the bullet reads as MUST). Did not add CLI enforcement — that
  would require kind-level change and wasn't requested.

Next check: 2026-06-22 (per spr frontmatter). Will assess whether
`[change]` tasks shipped after today carry Before numbers.
EOF
)"
```

### Step 5 — Flip status

```bash
loopany artifact status <spr-id> accepted --reason "applied diff to skills/change-ledger.md"
```

The `--reason` lands in `audit.jsonl`, not in the body.

### Step 6 — Commit

Commit **together**: the target skill edit + the proposal update.

```bash
cd <workspace-root-with-git>
git add skills/change-ledger.md
git add "$LOOPANY_HOME/artifacts/2026-04/spr-<timestamp>.md"
git commit -m "skill(change-ledger): require ## Before on done flip

Applied spr-20260422-093037 — see proposal body for motivation and
learning lrn-20260422-120000 for evidence."
```

If the loopany workspace and the skill file are in different git repos
(e.g. skill is in `~/Workspace/loop/skills/`, artifacts in `~/loopany/`),
you'll need two commits — one per repo. That's fine; link them by
timestamp in the commit messages.

## Reject flow

### Step 1 — Read, same as accept

### Step 2 — Record the reason

```bash
loopany artifact append <spr-id> --section Outcome --content "$(cat <<'EOF'
Rejected 2026-04-22.

Reason: the proposed rule is too narrow. Requiring `## Before` for every
`[change]` task punishes the case where the change is exploratory and
measurement isn't available yet (e.g. "try a different model, see if it
feels better"). A gentler version ("encourage ## Before; warn if
missing") would catch the target cases without the false positives.

If a future proposal wants to address the same underlying learning
(lrn-20260422-120000), it should target the gentler form.
EOF
)"
```

**The reason matters.** Future `reflect` runs read rejected proposals to
avoid re-suggesting the same thing. A one-line reject ("no thanks") is
useless evidence.

### Step 3 — Flip status

```bash
loopany artifact status <spr-id> rejected --reason "too narrow — would punish exploratory changes"
```

No git commit needed on reject — no file changed.

## Edge cases

### The proposal's `target_skill` file doesn't exist

Treat as reject with reason "target file no longer exists — skill was
likely renamed or removed since the proposal was written." If the
underlying learning still holds, the user can re-issue a proposal
pointing at the correct file.

### The proposal contradicts a more recent learning

Example: spr-A (pending, from 2 weeks ago) says "always do X"; but
lrn-B (active, from last week) says "X was wrong in context Y".

Before accepting, check: does the spr's motivation cite an older learning
that's now superseded? If yes, reject with reason "underlying learning
superseded by lrn-B — re-evaluate whether this proposal still applies."

### Multiple pending proposals touching the same skill file

Accept one at a time, commit between each. The second proposal needs to
be re-read against the post-first-accept state of the skill; its
"Proposed change" may need reinterpretation or may no longer apply.

## Anti-patterns

### ❌ Editing the skill beyond the proposal's scope

The proposal defines the contract. If you see other problems in the skill
file while editing, don't fix them in the same commit. Write a new
proposal (or raise them to the user) separately.

### ❌ Accepting without reading the learning

The `## Motivation` cites the learning for a reason. If you accept
without reading it, you can't know whether the proposal's scope matches
the evidence's scope.

### ❌ Empty Outcome

"Accepted." — not enough. The Outcome is the proposal's own post-mortem:
what you literally changed, any interpretations you made, what future
review will look at.

### ❌ Quietly widening the reject reason

If the user said "no" without an articulate reason, ask them to give one
before you write the Outcome. A vague reject ("user didn't want it")
creates weak future signal. If they decline to articulate, write what
they did say verbatim and note that.

## Quick reference

```
accept:  read spr → read lrn → read target → edit target → append Outcome → status accepted → git commit (target + spr)
reject:  read spr → append Outcome (with real reason) → status rejected
```
