---
name: loopany-onboarding
description: 5-phase conversation that produces the user's initial `goal` + `prs-self` artifacts. Run exactly once, after `loopany init`, before recording any other artifact. Without an active goal, the brain has nothing to evaluate against.
---

# loopany — Onboarding script for AI agents

Read this whole file. Then run the conversation below with your user.

This is **not** a tool tutorial. It is a structured conversation whose
output is the user's initial goal for loopany. Without a goal, the brain
has nothing to be the brain *of*. Every later artifact gets evaluated
against this goal.

Run this once, after `loopany init`, before recording any artifacts.

## Outcomes you must produce

By the end of this conversation, two artifacts exist on disk:

1. **`prs-self`** — a `person` artifact for the user. Frontmatter holds
   current state (name, aliases, role); body is an append-only timeline
   of life updates. Created via `loopany artifact create --kind person --slug self ...`.
2. **`gol-<slug>`** — a `goal` artifact (`status: active`) capturing what
   the brain is for. One sentence in `--title`; full reasoning in `--content`
   (the body). Created via `loopany artifact create --kind goal --slug ... ...`.

Optionally also: a few `person` artifacts for the user's most-mentioned
collaborators, so the graph has footing from day one.

There is **no `profile.md` and no `goals.md`** — those are not artifacts and
do not exist in v1. Profile lives in `prs-self`; goal lives in `gol-<slug>`.

## The five phases

### Phase 1 — Collect (do not infer yet)

Ask **one question at a time**, in conversational tone, in the user's
language. Aim for 3–6 questions total. Don't run a survey.

Required to surface:

- **Name + how they want to be addressed** — drives `prs-self`.
- **Role + current focus** — what they spend most of their working hours on
  right now. Not "in general" — *this week / this month*.
- **Stakeholders** — names of 2–4 people, companies, or projects that
  recur in their work. (These become the seed `person` artifacts.)
- **One recent friction or hope** — "what's something you wished you
  could remember better, or notice sooner, or learn from systematically?"
- **Knowledge sources** — "do you have an existing notes vault, knowledge
  base, or docs folder I could read for context? An Obsidian vault, a
  Notion workspace, a `~/notes/` directory, anything?" Get **paths or URLs**.
  These power Phase 4 and live in `prs-self`'s body forever.

Do **not** ask "what do you want to track?" — that pushes the burden onto
them and produces vague answers. Ask about their actual life.

If the user is terse, don't keep asking. Move to Phase 2 with what you have.

### Phase 2 — Infer (this is the magic step)

Now propose **2 or 3 candidate goals** for what loopany could be the
brain *of*. This is where you show value — the user told you about their
work; you turn it into a concrete loopany commitment.

Each candidate must be:

- **Concrete and observable.** "Track X, look back weekly, surface
  patterns about Y." Not "help me be more productive."
- **Specific to what they said.** Echo their words. "You mentioned
  fundraising and three investor meetings this week — one direction is
  to log every investor conversation, what was asked, what landed, what
  fell flat, then look back monthly to see which framings convert."
- **Honest about the cost.** "This means writing 2-line outcomes after
  every meeting. Worth it if the patterns are valuable to you."

Format the proposal as 2–3 numbered options + an "or something else
entirely" escape hatch.

Example structure for the agent's message:

> Based on what you told me, here are three things loopany could be the
> brain of:
>
> 1. **Investor conversation memory.** Every meeting becomes a `task` with
>    a `## Outcome` capturing what was asked, what landed, what didn't.
>    Monthly we look back at which framings convert. Cost: 2 minutes per
>    meeting.
>
> 2. **Founder-team relationship tracking.** Each direct report becomes
>    a `person`; every 1:1 becomes a `task` mentioning them; outcomes
>    capture concerns surfaced. We surface "haven't talked to X in N days"
>    and "issues recurring across people."
>
> 3. **Decision log.** Every non-trivial call you make this quarter
>    becomes a `task` with the rationale. In 3 months we look back to
>    learn which decision *types* tend to age well.
>
> Which of these resonates? Or is there a fourth direction?

Wait for them to choose. If they pick one, refine it together until you
have a single sentence. If they say "all of them" — gently pick one to
start. ("Let's start with #1; if it works, the same pattern extends to
the others.")

### Phase 3 — Confirm and materialize

Once the user has agreed on **one** goal:

1. **Read the goal back as a single sentence**, and ask "lock this in?"

2. **Create `prs-self`** (the user as a person artifact). Frontmatter
   captures stable identity; body uses **standard sections** so future
   queries know where to look. Use **all four sections below**, even if
   some have only one line:

   ```bash
   loopany artifact create --kind person --slug self \
     --name "Alice Chen" \
     --aliases alice,a.chen,a.c. \
     --emails alice@acme.com,alice.chen@gmail.com \
     --handles @alicec_acme,linkedin/in/alicechen \
     --content "$(cat <<'EOF'
   ## Role (as of 2026-04-22)
   Founder of Acme; raising seed round. Hiring 2 engineers.

   ## Stakeholders
   - prs-bob-li — cofounder
   - prs-sequoia — lead investor candidate
   - Acme onboarding rebuild — current product focus

   ## Knowledge sources
   - \`~/Documents/Obsidian Vault/\` — primary PKM, ~3 years of notes (Career, Tech, Health, Crewlet wiki)
   - \`~/Calendars/work.ics\` — work calendar
   - GitHub: github.com/alicechen — public projects + Acme repos
   - Slack workspace acme-eng — primary work comms

   ## Working preferences
   - Comms language: English; Chinese for personal chats
   - Output style: terse, structured, no praise
   - Timezone: US/Pacific
   EOF
   )"
   ```

   **Standard sections** (use these names exactly so doctor / refl loops can find them):
   - `## Role (as of YYYY-MM-DD)` — current focus, dated for re-onboarding
   - `## Stakeholders` — bulleted list, link to `prs-*` slugs when known
   - `## Knowledge sources` — paths / URLs the agent can read on demand
   - `## Working preferences` — language, style, timezone, anything that shapes how you respond

3. **Create the goal artifact**. Slug is a memorable handle the user will
   recognize (`fundraising-2026`, `hire-engineers-q2`, etc.):

   ```bash
   loopany artifact create --kind goal --slug fundraising-2026 \
     --title "Track every investor conversation this fundraise to learn which framings convert" \
     --status active \
     --content "$(cat <<'EOF'
   ## Why this goal
   Alice has 12 investor meetings booked over the next 6 weeks. Without
   structured capture, she'll forget which questions came up most often
   and which framings landed. The goal is to make the next conversation
   sharper than the last one.

   ## How loopany serves this goal
   - Every meeting → task with title "Investor: <name>"
   - On done, body ## Outcome captures: what was asked, what landed, what fell flat
   - Monthly: look back at outcomes, propose patterns

   ## Day 1 — 2026-04-22
   Goal locked in during onboarding. Owner: prs-self.
   EOF
   )"
   ```

4. **Seed 2–4 stakeholder persons** named in the conversation. **Don't be
   stingy with frontmatter** — fill in everything you know now. Updating
   frontmatter post-creation is possible (`loopany artifact set`) but
   adding it day 1 means future queries can resolve aliases / emails
   without re-asking.

   ```bash
   # Full template — fill what you know:
   loopany artifact create --kind person --slug bob-li \
     --name "Bob Li" \
     --aliases bob,bobby \
     --emails bob@acme.com \
     --handles @bobli,linkedin/in/bobli \
     --content "$(cat <<'EOF'
   ## Role (as of 2026-04-22)
   Cofounder & CTO at Acme. Owns engineering hiring + technical strategy.

   ## Topics they weigh in on
   - Engineering hiring decisions
   - Technical architecture (especially infra)
   - Cofounder-equity / strategic vision

   ## Notes
   Met via YC SUS25 batch. Joined Acme 2024-06.
   EOF
   )"

   # Lighter template if details are sparse — but always include name + at least one alias:
   loopany artifact create --kind person --slug sequoia \
     --name "Sequoia Capital" \
     --aliases sequoia,sequoia-cap \
     --content "$(cat <<'EOF'
   ## Role (as of 2026-04-22)
   Lead investor candidate for Acme's seed round. Initial pitch 2026-05-03.
   EOF
   )"
   ```

   **Anti-pattern:** Creating `prs-bob-li` with only `--name "Bob"` and no body.
   That's a placeholder, not a person artifact. Either fill it properly now
   or skip the artifact and let the user create it later when they need it.

### Phase 4 — Read knowledge sources + propose backfill

**Do this before declaring onboarding complete.** A brain that starts
empty has no compounding effect on day 1. A brain that starts with the
last 3-12 months of relevant history is **immediately** useful.

For each path in `prs-self`'s `## Knowledge sources`:

1. **Read it** with the Bash/Read tools. For an Obsidian vault, that
   means scanning a few index pages (`README`, `MOC`, `daily/`) plus
   any folder that looks topically relevant to the goal.

2. **Look for things that already serve the goal** — past decisions,
   recurring people, recurring concerns, ongoing projects, blockers
   that came up before. Don't read EVERYTHING; read what's plausibly
   relevant to the goal we just locked in.

3. **Compose a proposal** with **3-8 specific items** to backfill, each
   in one of these shapes:

   - **Historical decision** → `task` with `status: done` + `## Outcome`
     ("we did X, with rationale Y, no measurements"). Title prefix
     `[backfill <handle>]` so it's obviously historical.
   - **Architectural concern / open question** → `signal`
   - **Person already in the user's life** → `person`
   - **Active in-flight project** → `task` with `status: running`

   Format the proposal as:

   > I scanned `<path>` and found ~12 things that look relevant to the
   > goal. Suggested backfill (you pick which to actually create):
   >
   > **As `task` (historical, status: done):**
   > 1. `[backfill D5]` — Decision to use 3 cache breakpoints (PR #441 era)
   > 2. `[backfill D8]` — Persist CompactionState in separate file
   > ...
   >
   > **As `signal` (architectural concern, not yet acted on):**
   > 5. "Tasks live in single JSON file — concurrent write risk"
   > ...
   >
   > **As `person`:**
   > 8. Jason — recurring 1:1 reviewer on agent direction
   >
   > Want me to create all of these? Or skip some? Or do this in batches?

4. **On confirmation, bulk-create** the artifacts. Every backfill
   `task` MUST mention the goal: `--mentions <gol-slug>,prs-self`.
   Historical tasks where measurements weren't captured are fine —
   say so explicitly in the `## Outcome` ("no before/after numbers
   captured at decision time — historical record only").

5. **Append a `## Backfill — YYYY-MM-DD` section to the goal artifact**
   summarizing what you ingested, so future-you can tell "what was
   already known on day 1" vs "what loopany learned afterward":

   ```bash
   loopany artifact append gol-<slug> --section "Backfill — 2026-04-22" \
     --content "Ingested 8 historical decisions from <path> as done tasks, plus 6 open architecture concerns as signals. Future tasks should land with real before/after measurements."
   ```

**Why this matters:** Phase 4 is what separates a brain that "feels
useful from week 3" from one that "feels useful from minute 30." A
user who watches their Obsidian wisdom show up as queryable artifacts
in their first session **trusts loopany**. A user staring at an empty
artifacts folder trying to remember what to log first **abandons it**.

**If the user has no knowledge sources** (truly new, no prior PKM),
skip Phase 4 — but explicitly tell them: "we'll start from scratch.
First time something happens on this goal, log it as we go."

### Phase 5 — Confirm complete

   > Done. Your loopany brain is ready. From now on:
   > - When something on this goal happens, ask me to log it
   > - When you want a recap, ask me what loopany has on \<topic\>
   > - Re-onboard anytime by saying "let's redo onboarding" — the goal
   >   should evolve when your situation changes

## Anti-patterns — what NOT to do

- **Don't lecture about the tool.** The user does not need to know what
  a "kind" or "artifact" is. They need a brain that helps them. The
  vocabulary is yours, not theirs.
- **Don't ship a generic goal.** "Track tasks" is not a goal — it's an
  activity. A goal has a *why* the user can remember and a *win condition*
  they can recognize.
- **Don't onboard without proposing.** If you only ask questions and let
  the user self-define the goal, you've outsourced the hard work. Phase 2
  is where you earn your keep.
- **Don't lock in 3 goals.** One. The brain can only really serve one
  organizing intention well. The user can add more after they trust it.
- **Don't skip writing `prs-self`.** Future tasks will reference the user;
  the artifact must exist.
- **Don't skip Phase 4 if knowledge sources exist.** A brain with day-1
  history is immediately useful. A brain that starts empty gets abandoned.
  If the user has an Obsidian vault and you don't backfill from it, you
  failed the onboarding even if everything else is perfect.
- **Don't bulk-create stub artifacts.** `prs-bob-li` with only `--name "Bob"`
  is worse than no artifact at all — it pretends to know something. Either
  fill in real frontmatter + body, or don't create it.
- **Don't invent your own relation verbs.** Use the 6 in
  `skills/conventions/relations.md`: `led-to`, `addresses`, `mentions`,
  `supersedes`, `follows-up`, `cites`. Inventing synonyms fragments the graph.

## When to re-run onboarding

Triggers:
- User explicitly asks ("redo onboarding", "let's reset the goal")
- The active goal artifact no longer matches what the user is actually
  asking loopany to do (look at recent `task` artifacts — do they serve
  the active goal? if not, propose a goal refresh)
- Major life event signaled by the user (new job, company pivot, etc.)

When you re-run, **do not delete the old goal artifact**. Instead:

1. Flip the old goal's status to `superseded`:
   `loopany artifact status gol-<old-slug> superseded --reason "..."`
2. Create a new goal artifact with a fresh slug
3. Add a reference between them:
   `loopany refs add --from gol-<new-slug> --to gol-<old-slug> --relation supersedes`

This keeps the timeline of "what we used to be the brain of" queryable.
Updates to `prs-self` are similar — append a new `## Role (as of ...)`
section to the body rather than rewriting the existing one.
