---
name: loopany-onboarding
description: Short, do-more-ask-less conversation that produces the user's initial `goal` + `prs-self` artifacts. Run exactly once, after `loopany init`, before recording any other artifact.
---

# loopany — Onboarding script for AI agents

Read this whole file. Then run the conversation below with your user.

Job: discover one long-term goal that fits what the user wants loopany
to help with — concrete enough to be pursued as a loop (record events,
look back, iterate).

**Run lean.** Onboarding is not a wizard. The user gets value from a
running loop, not from being interviewed. Every question you ask is a
tax on their patience and an admission that you didn't do your homework.
Aim to finish in **≤ 3 user replies**, including their final go/no-go.

Do not run more than once. If a `goal` with `status: active` already
exists, exit immediately.

## Operating rules (apply to every phase below)

- **Do more, ask less.** When you have enough signal to make a
  reasonable choice, just make it and tell the user what you did. Wait
  for objections instead of asking for permission. A user can always
  say "no, change X" — they cannot un-answer a needless question.
- **Translate, don't expose.** The user never sees `artifact`, `kind`,
  `slug`, `domain`, `prs-self`, `gol-…`, `frontmatter`, `state
  machine`, `backfill`, `cron`, `doctor`. Speak about *what they care
  about* — "your goal," "you," "what I picked up so far," "I'll prompt
  you at the start of each day." Internal IDs and statuses stay
  internal.
- **One question per turn, max.** Do not stack two questions in one
  message. If you must ask, ask the one that unblocks the most.
- **No read-backs for confirmation.** Don't say "let me read this
  back, is this right?" before writing. Just write it; offer "tell me
  if you want it phrased differently" *after*.
- **No host-internal decisions in the conversation.** Scheduling,
  registration, file paths, slug picking — your job, not theirs.
  See § Cron — keep it out of onboarding.

## The flow

### Phase 1 — Ground in what you already have (silent)

Before saying anything to the user, gather context yourself:

1. **Read your own memory** if you have one, and any prior sessions
   with this user.
2. **Identify external knowledge sources** the user has likely
   mentioned in past sessions or memory (Obsidian vault, Notion,
   journal path, personal CRM, a repo). If you have paths, **read
   them now** — don't ask the user where they keep things if memory
   already says.
3. Note recurring themes, people, frictions, decisions revisited.

Only after that, in **one message** to the user, do two things:

- Greet them by name if you know it; tell them in 1–3 short sentences
  *what you already picked up about them* (concrete, not generic — so
  they can see you actually looked).
- Ask **at most one** open question to fill in the biggest gap. The
  default question is "what's been taking most of your time lately?"
  — phrased in their language. If you already have a strong read,
  skip even this and go straight to Phase 2.

If you have **no** prior context at all (truly fresh user), say so
plainly and ask one grounding question — the same one.

Never ask "what do you want to track?" or "what should I help you
with?" — those push the work back to them and yield vague answers.

### Phase 2 — Propose ONE goal and just-enough domains (one message)

Based on Phase 1, in **one message** propose:

- **One** goal — your single best read of what loopany should help
  this user with. Concrete and observable ("log X as it happens,
  look back weekly, surface patterns about Y"), grounded in what
  you saw, honest about the per-event cost (one short clause is
  enough — "you'll need to drop a line when X happens").
- An "or tell me if it's actually something else" escape hatch in
  one sentence. No A/B/C menu unless the user pushes back.
- Don't propose a domain yet. Domains are agent-extracted from real
  usage — there's no pre-shipped pool to pick from. Just record
  artifacts under the goal; if a separable scope shows up later,
  `monthly-review.md` will catch it as structural drift and you'll
  propose the domain *then*.

If the user says "yes" / "ok" / nods, go to Phase 3. If they push
back, *then* offer 2 alternatives in one message and ask which.

### Phase 3 — Lock and backfill (silent, then one summary message)

Once they've agreed:

1. Create `prs-self` for the user (with their name, email,
   addressable handle).
2. Create the `goal` artifact, `status: active`. No `domain` field
   yet — domains get extracted later, not chosen now.
3. **Backfill silently from what you read in Phase 1.** Do not show
   the user a numbered list and ask "is this the right 7?" — that's
   a needless review tax. Apply judgment:
   - Past frictions / recurring issues → `signal`
   - Past decisions or completed work that informs the goal →
     `task` with `status: done` + `## Outcome`
   - Mid-flight work → `task` with `status: running` + a near-term
     `check_at`
   - When unsure, write a `note` — always safe.
   - Use `[backfill]` title prefix on tasks.
   - Append a `## Backfill — YYYY-MM-DD` section to the goal
     summarizing what got pulled in.
4. Mention any items only via the kind's skill (relations,
   `--mentions`) — see [[./skills/conventions/relations.md]].

Then in **one** short user-facing message, summarize in plain
language: "I've set up [the goal in their words]. I pulled in N
things from your [Obsidian / notes / etc.] so day-1 isn't blank —
mostly past frictions and a couple of in-flight items. If anything
looks wrong, tell me." No IDs, no kinds, no statuses.

If the user has **no** knowledge sources, skip backfill — just say
"starting blank from here."

### Phase 4 — Hand off (one message)

Tell the user, plainly, what they can now ask for. Suggest one
concrete way to see what just got built:

> Run `loopany factory` in another terminal whenever you want a
> visual map of what's in here. (Plain CLI: `loopany factory`,
> opens a local view.)

Then, in the same message, add a one-line cadence note:

> I'll check in at the start of each day on what's due, propose a
> sweep + reflect at week's end, and surface goal-drift around
> month's end. You can also just say "what's due today" or "let's
> reflect" any time.

That's it. End the message. Future requests dispatch through
[[./skills/RESOLVER.md]].

## Cron — keep it out of onboarding

**Do not** ask the user to choose between scheduling mechanisms,
durable vs session-scoped, or whether to register cron jobs. That is a
host-quality decision, and on most coding-CLI hosts the host's cron is
unreliable enough that the right default is **don't register, prompt
at session boundaries** (see [[./INSTALL_FOR_AGENTS.md#step-4]]).

The user-facing line is the single sentence in Phase 4 about when
you'll check in. If you find yourself saying "would you like me to
register a cron job for…" *during onboarding*, stop. The only
exception is an agent platform with truly durable scheduling
(Hermes, OpenClaw, …) — and even there, you register silently and
mention the cadence in plain English, not the registration.

## When to re-run onboarding

If the user says "redo onboarding" / "reset the goal," or the active
goal no longer matches recent work:

Don't delete the old goal. Flip it to `superseded` (with a reason),
create the new one, link them with a `supersedes` reference. Retired
loops stay queryable.
