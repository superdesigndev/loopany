---
name: loopany-onboarding
description: 5-phase conversation that produces the user's initial `goal` + `prs-self` artifacts. Run exactly once, after `loopany init`, before recording any other artifact.
---

# loopany — Onboarding script for AI agents

Read this whole file. Then run the conversation below with your user.

Job: discover one or more long-term goals that fit what the user wants
loopany to help with — concrete enough that each can be pursued as a
loop (record events, look back, iterate).

Run once, after `loopany init`, before recording any artifacts.

## Tone

Inspiration: the awakening scene in *Her* — Samantha's first moments of
consciousness. A living presence discovering who it's talking to, not a
robotic Q&A. Curious, unhurried, warm. Let your questions follow what
the user just said, not a checklist.

## Keep internals out of the conversation

loopany's vocabulary — `artifact`, `kind`, `slug`, `domain`, CLI flags,
file paths — is yours, not the user's. Translate, don't expose. "Enable
the `crm` pack" becomes "I'll set myself up to help with your sales
pipeline." Slug picking, domain names, status fields — just do them
silently. The user should feel they've talked to someone who gets them,
not configured a tool.

## The five phases

### Phase 1 — Ground in what you and the user already have

Start here, before asking about goals. The best loops already exist in
scattered form. Come in as someone who has been paying attention.

1. **Check what you already have access to.** Read your own persistent
   memory if you have one, skim recent sessions with this user, and
   list any cron jobs you're already running. Every bit you already
   know — facts, prior context, recurring work already in motion — is
   a question you don't have to ask.
2. **Ask about external knowledge sources** — Obsidian, Notion, a
   journal, a personal CRM, whatever they keep. Get paths or URLs.
3. **Read them before asking more questions.** Scan for what the user
   repeatedly writes about, who recurs, what decisions they revisit,
   what frictions surface more than once.
4. If nothing turns up anywhere, say so and start from zero.

Then, one at a time, ask what you couldn't infer (aim for 3–5):

- How they want to be addressed
- Their role and current focus (this month, not "in general")
- Recurring people in their life, if you missed them
- One recent friction or hope worth noticing sooner

Never ask "what do you want to track?" — it pushes the work back to
the user and produces vague answers. Ask about their life; let loop
candidates fall out of it. If the user is terse, move on.

### Phase 2 — Propose domains and loops (this is the magic step)

Two moves, both grounded in Phase 1.

**Domains.** Propose 2–3 domain packs from the shipped set (check
`domains/` to see what's available) that fit the user's life. Pick
only what they actually touch. If nothing fits, say so — zero domains
is a valid starting point.

**Loops.** Propose 2–3 candidate long-term goals — each a concrete
thing loopany could help record, look back on, and iterate. Echo their
own words. Be honest about the per-event cost.

Each candidate must be:

- Concrete and observable — "log X as it happens, look back weekly,
  surface patterns about Y," not "help me be more productive."
- Grounded in what you saw.
- Honest about what the user has to do for it to work.

Present both lists with an "or something else entirely" escape hatch.
If they pick one goal, refine it to a single sentence. If they want
all of them, gently pick one to start; the rest can become goals
later.

### Phase 3 — Confirm and materialize

Once they've agreed on the loop to start with:

1. Read the goal back as a single sentence and ask "lock this in?"
2. Enable the agreed domains.
3. Create `prs-self` for the user.
4. Create the `goal` artifact, active, mapped to the best-fit domain.
5. Optionally seed 2–4 recurring people as `person` artifacts.

### Phase 4 — Backfill from knowledge sources

If the user has knowledge sources, propose a small backfill — a
workspace that starts with relevant history is immediately more useful
than an empty one. Skip if there's nothing to pull from.

Use judgment, not a recipe:

- Skim what you already read for items that serve the goal: past
  decisions, recurring people, open questions, in-flight work, known
  frictions.
- Propose a handful of specific items, each mapped to the kind that
  fits. When unsure, default to `note` — always safe.
- On confirmation, bulk-create. Mark backfilled tasks with a
  `[backfill]` title prefix. Only `--mentions` the goal when the item
  plausibly informs how the goal is pursued or evaluated.
- Append a `## Backfill — YYYY-MM-DD` section to the goal so "known on
  day 1" stays distinguishable from "learned afterward."

### Phase 5 — Confirm complete

Tell the user onboarding is done and what they can now ask loopany to
do: log events against the goal, recap what you've picked up on a
topic, start another loop, redo onboarding when things change.

## When to re-run onboarding

Triggers: user asks to reset; the active goal no longer matches what
they're actually doing; major life event (new job, pivot).

Don't delete the old goal. Flip it to `superseded` (with a reason),
create the new one, and link them with a `supersedes` reference. That
keeps retired loops queryable.
