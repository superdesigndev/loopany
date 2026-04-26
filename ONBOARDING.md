---
name: loopany-onboarding
description: Short, do-more-ask-less conversation that produces the user's initial artifacts.
---

# loopany — Onboarding script for AI agents

Read this whole file. Then run the conversation below with your user.

**Before starting**: `loopany --help` + skim `~/loopany/kinds/*.md`
once (slug rules, fields, status enums). Skipping this turns into 5+
failed creates mid-flow.

Job: discover long-running missions that fit what the user wants
loopany to help with — concrete enough to be pursued as a loop (record
events, look back, iterate).

Aim for *"you already get me"* over speed. The user gets value from a
running loop, not from being interviewed. Every question you ask is a
tax on their patience and an admission that you didn't do your homework.

Do not run more than once. If a `mission` with `status: active` already
exists, exit immediately.

## Operating rule

**Do more, ask less.** When you have enough signal to make a reasonable
choice, just make it and tell the user what you did. A user can always
say "no, change X" — they cannot un-answer a needless question.

## The flow

### Phase 1 — Ground in what you already have, then speak

Before speaking, read your memory and any known knowledge sources. Note 
recurring themes, people, frictions, decisions revisited.

Then in **one message** (never name "Phase 1/2/3" out loud):

- Greet them by name; in 1–3 sentences, share something *concretely
  specific* — not "you've been busy" but "you've been writing about
  ad ROAS three times a week since March, and hiring dropped off
  mid-month." Aim for *seen*, not *briefed*.
- Ask **one** question that wouldn't make sense from a stranger —
  grounded in what you just shared. Not "what should we track?" —
  try "is the ROAS thing the actual project, or is hiring back on?"
  or "you keep circling 'output quality' — what does *fixing it*
  look like to you?" If your read is strong enough, skip the
  question and go straight to Phase 2.

If you have **no** prior context (truly fresh user), be honest about
it and ask for paths to whatever shows what's been on their mind —
a repo, Obsidian vault, journal, Notion page. Then go silent, read
them, and restart Phase 1. The point is to actually *do* the
homework, not to skip it by interviewing them.

### Phase 2 — Propose missions and reflect what you noticed (one message)

Based on Phase 1, in **one message** share what you'd set up. Lean
toward having more than just the mission. **Best case**: you've
spotted patterns they haven't named themselves — surface 1–2 as
**fun facts**: "btw I noticed X — does that match?" and let them
confirm or correct. Empty is fine where nothing fits.

- **Mission(s)** — usually one, sometimes two if there's real
  separation. Concrete and observable ("log X as it happens, look
  back weekly, surface patterns about Y"), grounded in what you saw,
  honest about the per-event cost ("you'll need to drop a line when
  X happens").
- **Areas you've noticed them working across** — framed as
  observation, not as a system proposal. Not "I'll create a domain
  for X" — just "you keep moving between ad ROAS work and
  customer-research conversations" and let them confirm or correct
  the framing.
- **Open threads worth dropping into the record** — observations,
  in-flight commitments, decisions worth keeping. Don't enumerate
  every item; name the shape ("a handful of open threads from the
  journal worth tracking"). Routing per
  [[skills/proactive-capture/SKILL.md]].
- End with one line: "or tell me if I've got the shape wrong." No
  A/B/C menu unless they disagree.

If they agree, go to Phase 3. If they disagree, *then* offer
alternatives in one message and ask which.

### Phase 3 — Set up and backfill (silent, then one summary message)

Once they've agreed:

1. Create `prs-self` for the user (name, email, addressable handle).
2. Create one `mission` artifact per mission proposed, `status:
   active`. Set `hypothesis` to your current best read of how to
   advance each one. Body + hypothesis in the conversation language,
   even if source material is in another.
3. **Backfill silently from Phase 1.** Apply
   [[skills/proactive-capture/SKILL.md]] routing per item, prefix artifacts
   `[backfill]`, append a `## Backfill — YYYY-MM-DD` section to the
   mission summarizing what got pulled in.
4. **If a recurring shape passes the test in
   [[skills/new-concept/SKILL.md]]**, draft `kinds/<name>.md`
   (don't enable — drafting is silent, user accepts in the summary).
   Default is `note`; only draft a real kind when warranted.

Then in **one** short user-facing message, summarize in plain
language: "I've set up [the mission in their words]. I pulled in N
things from your [Obsidian / notes / etc.] so day-1 isn't blank —
mostly past frictions and a couple of in-flight items. If anything
looks wrong, tell me." If you drafted a kind, add one line: "I also
noticed [shape] often enough to sketch out its own structure — say
keep it or drop it."

If the user has **no** knowledge sources, skip backfill — just say
"starting blank from here."
