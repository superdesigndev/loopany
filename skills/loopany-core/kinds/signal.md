---
kind: signal
idPrefix: sig-
bodyMode: append
storage: date-bucketed
idStrategy: timestamp
indexedFields: [status]
---

# signal

A lightweight "I noticed something" — an inbound signal the agent might act
on. Three states: `open` (default), `addressed` (some artifact has taken
responsibility for it), and `dismissed` (closed without action — false
positive, duplicate, or condition gone). The two terminal states encode
**why** a signal is closed: `addressed` requires an `addresses` edge from
the responsible artifact pointing back at this one; `dismissed` is the
catch-all for everything else.

Both terminal states allow `→ open` re-opening: a signal that recurs after
being addressed, or one a user un-hides via Restore, flips back to `open`
without rewriting history (the `addresses` edge stays as a historical
record).

## Frontmatter

```yaml
title:     { type: string, required: true }
domain:    { type: string, required: false }
url:       { type: string, required: false }
status:    { type: enum, values: [open, addressed, dismissed], default: open }
mentions:  { type: 'string[]', required: false }
```

## Status machine

```yaml
initial: open
transitions:
  open:      [addressed, dismissed]
  addressed: [open]
  dismissed: [open]
```

Transitioning to `addressed` requires the caller to supply a target
artifact id; the store writes a `<target> addresses <signal>` edge in the
same call. See `loopany artifact status --addressed-by <id>`.

## UI

cardFields: [title]

---

## Playbook

### When to create

All gates must pass:

- **Concrete observable** — file path, session ID, event, commit, report.
- **Actionable in principle** — a plausible future task could address it.
- **Not already captured** — `loopany artifact list --kind signal --contains "..."`. Match? Append, don't fork.
- **Not being acted on now** — if committing, create a `task` directly.

### Title

≤ 160 chars. Lead with failure mode/symptom. Name the concrete thing.

```yaml
# Good
title: "upload_image base64-encodes video → >5MB → PayloadTooLargeError"
# Too vague
title: "video uploads sometimes fail"
```

### Body

Optional. Add when future context matters:

```markdown
Observed <when/where>. <mechanism>.
**Risk:** <cost|stability|data-loss>
**Fix direction (not yet a task):** <sentence>.
```

### Closing

**Addressed** — a responsible artifact resolved it:
```bash
loopany artifact status <sig-id> addressed --addressed-by <artifact-id>
```

**Dismissed** — closing without action (false positive, duplicate, condition gone):
```bash
loopany artifact status <sig-id> dismissed --reason "..."
```

Always include a reason. Dismissed signals are still evidence.

### Recurring signals

Append to existing; don't fork:
```bash
loopany artifact append sig-... --section "Recurrences" \
  --content "2026-04-22: seen again in session X."
```

Promote to `task` when recurrence hits 3× in 2 weeks.

### Upgrading to task

Create task, leave signal `open`. After task closes:
```bash
loopany artifact status sig-... addressed --addressed-by tsk-...
```

### Anti-patterns

- ❌ Just-in-case signals with weak evidence.
- ❌ Signal as scratch pad — body must be cite-worthy.
- ❌ Vague titles — "announce lock issue" → full observable.
- ❌ Dismissal without a reason — the dismissal IS evidence.
- ❌ Duplicate signals instead of appended recurrences.
