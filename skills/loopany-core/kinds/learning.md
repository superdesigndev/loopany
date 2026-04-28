---
kind: learning
idPrefix: lrn-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [domain, status, check_at]
---

# learning

A hypothesis derived from observed outcomes — something the agent (or
human) came to believe based on specific artifacts. Each learning carries
its evidence, a scope, and a followup date.

Learnings describe **belief**, not behavior. A belief alone doesn't
change how the agent acts; a matching `skill-proposal` does that, and
must cite the learning. Decoupling the two lets one belief drive zero,
one, or several behavior changes — and lets a belief be revised without
churning every derived skill.

When understanding changes, **don't edit the old learning**. Create a
new one with `supersedes` pointing to the old, then flip the old to
`superseded`. The graph preserves the trajectory of what you believed
and when.

## Frontmatter

```yaml
title:      { type: string, required: true }
domain:     { type: string, required: false }
status:     { type: enum, values: [active, superseded, archived], default: active }
evidence:   { type: 'string[]', required: false }
supersedes: { type: string, required: false }
check_at:   { type: date, required: false }
mentions:   { type: 'string[]', required: false }
```

## Status machine

```yaml
initial: active
transitions:
  active:     [superseded, archived]
  superseded: [archived]
```

## Required sections

On `status: superseded` → body must contain `## Outcome`
On `status: archived` → body must contain `## Outcome`

## UI

cardFields: [title, domain, status]

---

## Playbook

### When to create

Only from a **pattern** across multiple artifacts. The `loopany-reflect`
skill drives this. Minimum discipline:

- **Title** = the belief itself, as a declarative sentence.
- **`evidence`** cites ≥ 2 artifact IDs.
- **Body** covers `## Observation`, `## Evidence`, `## Scope`, `## Check-at`.
- **`check_at`** 1-3 months out with a concrete revalidation question.

When understanding changes, create new learning with `supersedes`;
don't rewrite the old one.

A learning may stop at "now we know." Create a `skill-proposal` only
when it implies a concrete skill edit.

### Anti-patterns

- ❌ One task → one learning — wait for ≥ 2 data points.
- ❌ Learning as diary entry — "shipped #450" is an outcome, not a belief.
- ❌ No `check_at` — beliefs rot silently.
