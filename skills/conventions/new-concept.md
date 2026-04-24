---
name: loopany-new-concept
description: Use when picking between note / new kind / new domain — before `loopany kind propose`, before extracting a new domain, or any time the user says "I want to track X" / "should we add a kind for…" / "let's make a domain for…". Default: write a note. Triggers on any new-concept decision in a loopany workspace.
---

# new-concept — note, kind, or domain?

**Default: write a `note`.** Promote only when structure pays back.

## Three questions, in order

**1. Does an existing kind already fit?** Use it. Stop here.

**2. Does at least one of these hold?**

- moves through enforced **states**
- many references resolve to **one identity** (dedup)
- queried/filtered by **typed fields**
- downstream needs **fixed body sections**

If none → it's a `note`. If yes → continue.

**3. Is it about HOW any agent operates (not WHAT it operates on)?**

- yes, every agent wants this slot, distinct lifecycle → **core kind**
- no, it's a vertical or domain-specific entity → **domain kind**
  (lives inside the domain that owns the scope)

## Domain is a separate axis

Domains aren't pre-shipped. Propose one only when **observed usage
shows a separable scope** — recurring artifacts that share a vertical
(sales pipeline, paid ads), a rhythm (weekly review), or a workflow
that wants its own settings / cron / skills, and that doesn't make
sense in the global pool.

Two signals worth waiting for before proposing:

- ≥ 5 artifacts already carry the same `domain: <name>` value the
  user has been writing informally, **or**
- A new kind would only ever be valid inside one scope.

Domains can host kinds. Kinds can't host domains. **When torn between
"new kind" and "new domain that holds that kind", prefer the domain** —
the kind travels with it.

## Examples

- "Client likes async standups" — 4-question test all fail → `note`.
- "Podcast appearances" — identity + typed + body shape pass → kind.
  Every-agent test fails → **domain `podcast` with `kinds/appearance.md`**.
- "Weekly investor update cadence" — not a new kind; it's a new scope
  → **domain `investors`**, reuses existing `brief` + `task`.

**Entity-as-kind (not task) — common confusion**:

- "Podcast episodes / blog posts / tweets" (the *published thing*, not
  the writing of it) — identity + queryable metrics + consistent body
  shape → **kind `post`** (inside `social` or `content` domain if scope
  separates; standalone if the goal IS publishing). The writing is a
  `task`; the published artifact is the `post` — link via `produced`.
- "Customers" — repeat reference + structured query (status, ARR,
  contract date) → **kind `customer` in `crm` domain**.
- "Orders" — identity + status machine (placed → paid → shipped) +
  typed fields (amount, items) → **kind `order` in `commerce` domain**.

## Process

- Note → `loopany artifact create --kind note ...`
- New kind → draft `kinds/<name>.md`, run
  `loopany kind propose <file>`, wait for human accept
- New domain → surface the proposal with the kinds it bundles, scaffold
  `domains/<name>/` after user agrees (flow still maturing — flag it
  to the user)

## Anti-patterns

- ❌ "I want to track X" → propose a kind. Almost always a `note` first.
- ❌ Verticals (`recipe`, `deal`, `experiment`) as core kinds.
- ❌ A new domain when one extra field on a `note` would do.
- ❌ Skipping this skill and going straight to `kind propose`.
