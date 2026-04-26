---
name: loopany-relations
description: Pick the right `relation` verb (led-to / addresses / mentions / supersedes / follows-up / cites) when running `loopany refs add`, writing `mentions[]` in frontmatter, or any `[[id]]` wiki link. Read before creating any reference edge — synonyms fragment the graph.
---

# relations — convention for `loopany refs add --relation <verb>`

`relation` is an open registry — you can pick any string. But if every agent
picks differently, the graph becomes unsearchable. Use the verbs below
unless you have a strong reason not to.

Relation direction matters: `A <verb> B` reads "**A → verb → B**". Always
write the relation in **one canonical direction** (the active voice from
A's perspective). To find the inverse, query `--direction in`.

## The 6 verbs

### `led-to` — A produced B as a downstream artifact

A is the cause; B is what came of it. The most common verb.

```bash
loopany refs add --from sig-... --to tsk-... --relation led-to
# "this signal led to that task"

loopany refs add --from tsk-... --to brf-... --relation led-to
# "this task's outcome led to next morning's briefing"
```

**Inverse** (don't write it as a separate edge): query `loopany refs <B> --direction in --relation led-to` reads as "what led to B?".

### `addresses` — B is the action that handles A

Use when one task subsumes / acts on multiple signals or sub-tasks. Stronger
than `led-to`: it claims the action **resolves** the upstream observation.

```bash
loopany refs add --from tsk-output-v2-refactor --to sig-architecture-smell-1 --relation addresses
loopany refs add --from tsk-output-v2-refactor --to sig-architecture-smell-2 --relation addresses
# Refactor addresses both architectural concerns
```

> Convention: `led-to` is **weak causal** ("this resulted in that, eventually").
> `addresses` is **strong responsibility** ("this is the action handling that").

### `mentions` — A references B in passing

Soft link. Use for "this artifact talks about that entity" without committing
to a stronger semantic. There are **three equivalent ways** to create a
mention edge; pick whichever fits the writing moment:

**(a) Body wiki link — `[[id]]`** (preferred when the mention arises inside prose):

```markdown
## Outcome
Pairing with [[prs-alice-chen]] on the [[tsk-20260422-103045]] refactor paid off —
we caught the cache thrash before prod.
```

The runtime scans every artifact body for `[[<prefix>-...>]]` patterns whose
prefix is a registered kind (`tsk-`, `prs-`, `gol-`, ...). Code blocks
(fenced ```` ``` ```` or inline \`...\`) are skipped so examples in prose
don't generate spurious edges.

**(b) Frontmatter array** (preferred when the mention is structural — goal
attribution, primary stakeholder):

```yaml
# in tsk-... frontmatter
mentions: [prs-alice, gol-fundraising-2026]
```

**(c) Explicit graph edge** (use only when you didn't write the mention in
body or frontmatter at creation time, and don't want to edit the artifact):

```bash
loopany refs add --from tsk-... --to prs-alice --relation mentions
```

All three produce the same semantic edge. (a) and (b) are **implicit edges**
in the graph — they live in the artifact, not in `references.jsonl`, and
change automatically when you edit the source. (c) is a **persisted edge**
in `references.jsonl`.

Query: `loopany refs prs-alice --direction in` returns all three kinds
together. Implicit edges carry `"implicit": true` and `"actor": "body" |
"frontmatter"` in the JSON if you need to tell them apart.

**When you want a non-`mentions` relation via wiki-link syntax**: not
supported. `[[id]]` always means `mentions`. For `led-to`, `addresses`,
etc., use `loopany refs add` (with a verb).

### `supersedes` — B is the replacement for A

Use when a new artifact takes over from an old one. The old artifact is
typically flipped to a terminal status (`superseded`, `archived`).

```bash
loopany artifact create --kind goal --slug fundraising-2027 --title "..." --status active
loopany artifact status gol-fundraising-2026 superseded --reason "fundraise complete; new goal"
loopany refs add --from gol-fundraising-2027 --to gol-fundraising-2026 --relation supersedes
```

Same pattern for re-onboarding (new prs-self → old prs-self), goal shifts,
and architecture rewrites.

### `follows-up` — B is a continuation of A

Use when B picks up where A left off — a re-engagement, a check-in, a next
step. Distinct from `led-to`: A wasn't necessarily the *cause* of B, but B
**continues the thread**.

```bash
loopany refs add --from tsk-investor-followup-may --to tsk-investor-meeting-april --relation follows-up
```

A natural pattern: every `task` with `check_at` future-dated is implicitly
a follow-up of the task that scheduled it. When the future task is created,
add the explicit edge.

### `cites` — B is the source / evidence for a claim in A

Use when A's body draws on B as fact. Especially useful for `brief` artifacts
that summarize multiple `task` outcomes.

```bash
loopany refs add --from brf-weekly-2026-04-22 --to tsk-investor-meeting-1 --relation cites
loopany refs add --from brf-weekly-2026-04-22 --to tsk-investor-meeting-2 --relation cites
```

The `brief` body says "Three meetings landed; one stalled" — the `cites`
edges back-reference the source artifacts so the user can drill in.

## Anti-patterns

### ❌ Writing both directions

```bash
# WRONG — this is the same fact stored twice
loopany refs add --from sig-1 --to tsk-1 --relation led-to
loopany refs add --from tsk-1 --to sig-1 --relation caused-by
```

The reverse query (`refs sig-1 --direction in`) gives you the same answer
without the duplication.

### ❌ Inventing synonyms

```bash
# WRONG — synonyms fragment the graph
loopany refs add --relation triggered      # use led-to
loopany refs add --relation resolves       # use addresses
loopany refs add --relation references     # use mentions
loopany refs add --relation replaces       # use supersedes
loopany refs add --relation continues      # use follows-up
```

If a real new semantic appears, add it to this doc rather than inventing
ad-hoc verbs.

### ❌ `led-to` for every edge

`led-to` is the default temptation when you're not sure. If you find
yourself writing it for every refs.add, ask: was this **causal** (use it),
**responsive** (`addresses`), or just **referential** (`mentions`)?

## Walking chains, not single edges

`loopany refs <id>` is one hop. For the full lineage — "what fed into
this learning, all the way back" or "what came of this signal, all the
way forward" — use `loopany trace`:

```bash
loopany trace <id> --direction backward
# walks led-to / addresses / supersedes / follows-up / cites
# (mentions excluded by default — soft pointer, not lineage)
```

Output is a signed-distance timeline: negative = causes, 0 = root,
positive = effects. Override the predicate set with `--relations csv`.

## Quick reference

| Verb         | Direction                        | When to use                              |
|--------------|----------------------------------|------------------------------------------|
| `led-to`     | cause → effect                   | "X resulted in Y, eventually"            |
| `addresses`  | action → observation/concern     | "Y is the action that handles X"         |
| `mentions`   | source → entity                  | Soft reference; passing name-drop        |
| `supersedes` | new → old                        | Replacement after a major shift          |
| `follows-up` | continuation → original          | Picking up a thread later                |
| `cites`      | summary → source                 | Briefing → the artifacts it draws from   |
