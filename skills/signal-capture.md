---
name: loopany-signal-capture
description: Decide whether an observation justifies writing a `signal` artifact. Default is skip — signals must be concrete, actionable, and not-already-captured. Use when you or the user are about to log something as a signal.
---

# signal-capture — what to log as a `signal`, and what to skip

A `signal` is **"I noticed something, someone should maybe act on it."**
Not a task (no commitment to action), not a log entry (should mean
something later), not a thought (has to be concrete enough to cite).

The cost of a bad signal is worse than the cost of a missed one: noisy
signals pollute the `improve` skill's reflection, dilute dismissal
decisions, and push real ones down the list. **Default: skip.** Only
write when the criteria below fire.

## When to create a signal

Create a signal when **all three** hold:

1. **Concrete observable** — you can point to where you saw it (file path,
   session ID, PostHog event, commit, conversation). Not "I have a vibe."
2. **Actionable in principle** — some plausible future `task` or
   investigation could address it. "The sky is blue" is not a signal.
3. **Not already captured** — search first:

   ```bash
   loopany artifact list --kind signal --contains "<key phrase>"
   ```

   If you find a match, don't duplicate — either do nothing, or **follow
   up** on the existing one (add body evidence via `artifact append`,
   bump it by creating a task that `addresses` it).

## When NOT to create a signal

- **You're about to act on it right now** → skip the signal, create a
  `task` directly with the observation in its body. Signals are for
  deferred attention.
- **It's a one-off nit** with no plausible recurrence (typo in a log
  message) → fix it or drop it. Don't archive the noise.
- **It's a belief, not an observation** ("I think our auth is fragile")
  → that's a `learning` candidate, not a signal. Signals are *what
  happened*, not *what I think about things*.
- **It duplicates an existing signal with zero new evidence** → skip or
  append to the existing one.

## Source — pick one

The `source` frontmatter field is indexed. Use one of these four unless
you have a strong reason:

| Source | Meaning |
|--------|---------|
| `cost` | Money / tokens / machine-hours wasted or at risk |
| `architecture` | Structural issue: coupling, missing abstraction, design drift |
| `observability` | "I only noticed this because I happened to look" — a gap in automatic visibility |
| `user-feedback` | Someone reported or reacted to something |

**Other values are allowed** (it's an open registry) but these four cover
most cases. If you find yourself wanting a fifth, ask: could this collapse
into one of the four with a better framing?

**Under the `crewlet-ops-health` goal specifically**, the three goal
triggers map to these sources — see the goal's "How loopany serves this
goal" section.

## Writing the `summary`

`summary` is the **primary searchable text**. `--contains` hits it. The
body might not be read for weeks; the summary has to stand alone.

Good summaries:

- **≤ 160 chars** — roughly one line in a terminal.
- **Lead with the failure mode / symptom**, then the mechanism.
- **Name the thing** — file path, tool name, PR number if relevant.

```yaml
# ✅ Good
summary: "upload_image base64-encodes video → >5MB → PayloadTooLargeError → circuit breaker"

# ❌ Too vague
summary: "video uploads sometimes fail"

# ❌ Too long (should be body)
summary: "When the user attempts to upload a video via the ads-manager subagent..."
```

## Body — what goes in it

Body is optional but recommended for any signal you want to come back to:

- **Where observed** — file path, session, date, memory file reference
- **Mechanism** — why this happens, not just what happened
- **Risk** — cost vs stability vs data loss; rough scale if known
- **Fix direction (not a plan)** — a sentence of "what might this look
  like" without committing to a task yet

If the signal is trivially self-explanatory (summary + source say it all),
skip the body. Noise-free is fine.

## Frontmatter template

```bash
loopany artifact create --kind signal \
  --summary "<one-line observable>" \
  --source <cost|architecture|observability|user-feedback> \
  --domain <domain> \
  --mentions "<goal-id>,prs-self,<optional-entity-ids>" \
  --content "$(cat <<'EOF'
Observed <when/where>. <mechanism in 1-2 sentences>.

**Risk:** <cost|stability|data-loss|etc.>
**Fix direction (not yet a task):** <sentence>.
EOF
)"
```

## Dismissing a signal

`dismissed: true` means "noted, but no action planned." Flip it when:

- You investigated and concluded it's a false positive.
- It's duplicated by a stronger signal and you're keeping the stronger one.
- The underlying condition has gone away (e.g. library upgrade made it
  moot).

```bash
loopany artifact set <sig-id> --field dismissed --value true
```

**Record why** — don't silently dismiss. Append a short body note:

```bash
loopany artifact append <sig-id> --section "Dismissal" --content "..."
```

Future `improve` runs read dismissed signals: "why does this class keep
getting ignored?" is a real pattern. A dismissal without a reason is
useless evidence.

**Don't dismiss to keep the list tidy.** Dismissal is a claim that the
signal is not worth acting on — that claim should survive a retrospective.

## Upgrading a signal to a task

When a signal crosses the threshold from "noted" to "doing something":

```bash
# Create the task
loopany artifact create --kind task \
  --title "[change] add upload_video tool to meta-ads plugin" \
  --status todo \
  --priority high \
  --mentions "<goal-id>,prs-self" \
  --content "..."

# Link: task addresses the signal (stronger than led-to)
loopany refs add --from tsk-... --to sig-... --relation addresses
```

Use `addresses` (not `led-to`) — the task claims responsibility for
resolving the observation. See `skills/conventions/relations.md`.

**Don't dismiss the signal when creating the task.** The `refs` edge is
the link. A signal stays "live" until the task it addresses is `done`
with a real Outcome — then consider dismissing with reason "addressed by
tsk-...".

## Recurring signals

If you find yourself writing a signal whose summary is near-identical to
one already in the workspace — **don't**. Options:

- **Append evidence** to the existing signal:
  ```bash
  loopany artifact append sig-... --section "Recurrences" \
    --content "2026-04-22: seen again in session X. Same mechanism."
  ```
- **Promote to task** if the recurrence count crosses 3 in ≤ 2 weeks.
- **Call it a blindspot**: if you only noticed it because you happened to
  look, add the signal with `--source observability` and count it against
  the goal's blindspot-tracker cadence.

The `improve` skill relies on recurrence being visible to spot patterns.
Fragmenting across duplicate signals breaks that.

## Anti-patterns

### ❌ Creating signals just in case

"Not sure if this matters, but I'll log it." → later, `improve` reads 30
weak signals and finds no pattern. Default skip. You can always create
later when a second instance makes it real.

### ❌ Treating signal as a scratch pad

Body full of exploratory notes with no conclusion. Use a memory file for
that; signals should be cite-worthy.

### ❌ Source = "other" or blank

The source field is the first filter for monthly review. "other" = dark
matter. Force a classification or don't create it.

### ❌ Summary is a sentence fragment

"announce lock issue" → too thin; unsearchable. Full observable: "Announce
handler has no session lock — parallel runAgentLoop on same session."

### ❌ Dismissing without a reason

The dismissal IS evidence. Treating it as a janitorial action loses that.

## Quick decision tree

```
Observed something?
├── Acting now? → task, skip signal
├── Already captured (search)? → append to existing
├── Trivial one-off? → fix or drop
├── Belief, not observation? → learning (later, after pattern)
└── Concrete + actionable + new? → signal
      ├── body-worthy? → add body
      └── later: recurs? promote to task with `addresses`
```
