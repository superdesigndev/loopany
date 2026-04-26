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
