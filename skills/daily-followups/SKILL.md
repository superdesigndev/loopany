---
name: loopany-daily-followups
description: Use on daily cadence, at session start, or when the user says "what's due today" / "what am I forgetting" / "daily check-in". Reads today's due `check_at` items, classifies each (silent resolve / surface / defer), and brings the user only what needs attention. Every surfaced item must close before session ends.
---

# daily-followups — daily check-in on what's due

`check_at` is how loopany surfaces the thing you owe future-you. Every
day the scheduler (or the user, in a coding CLI) fires this skill.
Your job: read what's due, decide what to do with each, and bring the
user only what actually needs their attention.

## When to run this

- Scheduled: once per day (agent platforms)
- On demand: user asks "what's due today," "what am I forgetting,"
  "daily check-in"
- At session start (coding CLIs) — highest-leverage habit of the day

Never more than once per day. Noisy digests train the user to ignore
them.

## Step 1 — Pull today's queue

```bash
loopany followups --due today
```

Returns artifacts whose `check_at` is today. Overdue sweeps belong to
[[weekly-sweep/SKILL.md]] — don't do them here.

If the list is empty, say so briefly and stop. A quiet day is a valid
outcome; don't manufacture something to surface.

## Step 2 — Classify each item

Read the body:

```bash
loopany artifact get <id>
```

Three buckets:

**A. Silently resolvable.** The artifact itself answers the question
it was scheduled for. A `learning` whose scope obviously still holds →
extend `check_at` with a one-line reason. A `task` whose outcome is
already captured elsewhere → flip to `done` via
[[core-artifacts/SKILL.md]].

**B. Needs the user.** A task whose `## Outcome` requires numbers only the
user has. A `learning` that may now be wrong. A `signal` that's come back
after being dismissed.

When the item is a `learning`, walk its causal chain before deciding —
the belief may rest on multi-hop evidence that's no longer fresh:

```bash
loopany trace <lrn-id> --direction backward
# returns every artifact that fed into the belief, in distance order
```

**C. Defer with a reason.** Not actionable today, but still relevant.
Push `check_at` forward and **record why** — silent deferrals rot.

## Step 3 — Surface to the user

Bring only bucket **B** to the conversation. Short digest, one line
per item, each with:

- the artifact id or slug (so the user can refer back)
- what's being asked, in plain language
- a concrete yes/no/defer prompt

Example:

```
3 things need you today:

1. [tsk-…] 2-week recheck on payload-shrink — did the $/session number
   settle? (expected ~$0.60)
2. [lrn-…] "short deals close 2.5x faster" — still true given Q2?
3. [sig-…] recurring signal on first-week churn, third time around.
   Upgrade to a task this round?
```

If you silently resolved bucket A items, add one summary line at the
end: "Also extended 4 learnings whose scope still holds — no action
needed."

## Step 4 — Dispatch responses

Don't handle outcomes inline. Route each response to the right skill:

- Task outcome → [[core-artifacts/SKILL.md]] § Task
- Learning revision → extend `check_at`, or write a new learning with
  `supersedes` (see [[reflect/SKILL.md]])
- Signal upgrade / dismiss → [[core-artifacts/SKILL.md]] § Signal

## Step 5 — Close every item you surfaced

**This is the gate that keeps the loop tight.** Before the session
ends, every bucket B item must exit in one of three closed states:

1. **Resolved** — state transition written (task flipped, signal
   dismissed or upgraded, learning superseded or extended).
2. **Deferred** — `check_at` pushed forward **with `--reason`**. "Wait
   until Q2 close" is a reason. "Not yet" isn't.
3. **Retired** — `check_at` removed, with a one-line note why the
   artifact no longer needs reminding.

If the user's response was ambiguous, clarify — don't guess a
transition. If the user disengaged mid-digest, default-defer only the
items you actually asked about (not the whole list), with reason "no
response this session." That still counts as a closed state: you
explicitly chose to push, next session will know why.

**Why this step exists:** without it, nothing actually happens.
Every surfaced item sits at its original `check_at`, shows up again
tomorrow, surfaces in [[weekly-sweep/SKILL.md]] next week, and trains the
user to ignore both digests. A digest whose prompts don't produce
state changes is noise.

## Anti-patterns

### ❌ Surfacing without closing

Three prompts + three unresolved responses = worse than no digest.
Every surfaced item ends the session in one of `resolved / deferred /
retired`. Zombie items are how this skill decays into noise.

### ❌ Dumping raw CLI output

`loopany followups` returns JSON. The user never sees it. Your job is
judgment — "these 3 of 11 need you" — not transcription.

### ❌ Running `--due overdue` here

Overdue sweeps are weekly. Mixing them into the daily digest means
nothing feels urgent. See [[weekly-sweep/SKILL.md]].

### ❌ Deferring without a reason

Every `check_at` push needs a reason. "Pushed 1 week" with no
rationale is how items rot.

### ❌ Manufacturing a followup because the list was empty

Quiet days are real. Report it and stop.

## Quick reference

```
QUERY:    loopany followups --due today
READ:     loopany artifact get <id> for each
CLASSIFY: A=silent resolve · B=surface · C=defer with reason
SURFACE:  only B · one line each · concrete prompt
DISPATCH: core-artifacts / reflect handle the action
CLOSE:    every surfaced item ends resolved / deferred / retired — no zombies
```
