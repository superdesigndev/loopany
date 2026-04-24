---
name: loopany-resolver
description: Read FIRST when working in a loopany workspace. Maps user intent to the correct loopany skill file. All other loopany skills are dispatched through this.
---

# loopany skill resolver

**Read this first.** This is the dispatcher. When a user request or an
internal decision matches a trigger below, **Read the target skill file
before acting.** If two skills match, read both — they chain.

Skills are markdown, not code. Every skill path is relative to the
`loopany` project root (where this file lives).

## Conventions (read these once, then keep in context)

These apply to **every** artifact you create or modify:

| Skill | When it applies |
|-------|-----------------|
| `skills/conventions/relations.md` | Any `loopany refs add` call, or picking a relation verb |

## On-demand skills — match by trigger

### Proactive capture — after substantive work concludes

| Trigger | Read |
|---|---|
| Main session notices work just ended (PR shipped, incident resolved, decision made, signal noticed, outcome observed) — before dispatching | `skills/capture-on-complete.md` (quality bar + subagent context) |
| Subagent dispatched with "record this via loopany" | `skills/capture-on-complete.md` (routing), then the form skill it names |

### Creating / handling artifacts

| Trigger (user said or agent decided) | Read |
|---|---|
| "I noticed…", "heads up", observed something worth logging | `skills/signal-capture.md` |
| Creating a `signal` (any source) | `skills/signal-capture.md` |
| Dismissing a signal, or it keeps recurring | `skills/signal-capture.md` (§ "Dismissing", § "Recurring signals") |
| "Let's do X", committing to work, `[change]` / `[incident]` | `skills/task-lifecycle.md` |
| Creating a `task`, writing Hypothesis / Before / Outcome | `skills/task-lifecycle.md` |
| Flipping task to `done` / `failed` / `cancelled` | `skills/task-lifecycle.md` (§ "Status transitions") |
| Upgrading a signal to a task | `skills/signal-capture.md` (§ "Upgrading") + `skills/task-lifecycle.md` |

### Self-iteration loop

| Trigger | Read |
|---|---|
| "reflect", "what have we learned", "improve yourself", weekly/monthly review | `skills/improve.md` |
| ≥ 3 `task`s flipped to `done` recently with similar Outcomes | `skills/improve.md` |
| Writing a `learning` or a `skill-proposal` | `skills/improve.md` (§ Step 3, § Step 4) |
| "accept spr-…", "reject spr-…", "let's take that proposal" | `skills/proposal-review.md` |
| Walking through pending proposals | `skills/proposal-review.md` |

## Disambiguation

When multiple skills match:

1. **Prefer the most specific skill.** `task-lifecycle` over a vague "creating things".
2. **Conventions apply on top of any skill.** Reading `task-lifecycle.md` doesn't exempt you from `conventions/relations.md` when you then call `refs add`.
3. **Skill chaining is explicit in each skill.** Follow the "Upgrading" / "Chain" / "Next" pointers inside a skill rather than guessing which one comes next.
4. **When in doubt, ask the user** before committing an artifact. A bad artifact is worse than a clarifying question.

## Anti-patterns

- **Acting without reading the skill.** You remembered the gist from last session — the skill has been edited since. Re-read.
- **Reading a skill but skipping its anti-patterns section.** That's where the failure modes live.
- **Writing an artifact without checking if a skill applies.** The cost of reading one markdown file is much less than the cost of a malformed artifact in the record forever.

## What's not (yet) in here

These triggers don't have a skill yet. If you hit one, use judgment and
flag it to the user as a candidate for `loopany kind propose` or a new
skill:

- Reading `loopany followups --due today` output and deciding what to do per item
- Deciding whether a named entity should become a new `person` artifact or just a mention
- Writing a `brief` (daily / weekly summary)
- Picking / creating a `domain`

See project TODOS or ask the user if one of these is blocking you.
