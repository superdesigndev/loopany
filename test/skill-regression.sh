#!/usr/bin/env bash
# skill-regression.sh — install loopany skills into Claude Code and run
# regression scenarios via `claude -p`.
#
# Usage:
#   ./test/skill-regression.sh           # run all scenarios
#   ./test/skill-regression.sh --dry-run # show what would run, skip claude calls
#   ./test/skill-regression.sh 3         # run only scenario 3
#
# Prerequisites:
#   - `claude` CLI in PATH (>= 2.0)
#   - `loopany` CLI in PATH (or `bun run src/cli.ts`)
#   - An active Anthropic API key configured for `claude`
#
# What it does:
#   1. Symlinks the 4 loopany skills into a temp skills dir
#   2. Creates a fresh loopany workspace
#   3. Runs test prompts via `claude -p` with skill access
#   4. Inspects the resulting workspace for correctness
#   5. Cleans up

set -uo pipefail

# ── Config ──────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
LOOPANY_CLI="bun $REPO_ROOT/src/cli.ts"

DRY_RUN=false
ONLY_SCENARIO=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    [0-9]*) ONLY_SCENARIO="$arg" ;;
  esac
done

# ── Temp dirs ───────────────────────────────────────────────────────────────

TMPBASE="$(mktemp -d /tmp/loopany-skill-regression.XXXXXX)"
SKILLS_DIR="$TMPBASE/skills"
WORKSPACE="$TMPBASE/workspace"

mkdir -p "$SKILLS_DIR" "$WORKSPACE"

cleanup() {
  rm -rf "$TMPBASE"
}
trap cleanup EXIT

# ── Install skills via symlink ──────────────────────────────────────────────

for skill in loopany-core loopany-reflect loopany-review loopany-capture; do
  ln -s "$SKILLS_SRC/$skill" "$SKILLS_DIR/$skill"
done

echo "Skills installed at: $SKILLS_DIR"
echo "Workspace at:        $WORKSPACE"
echo ""

# ── Init workspace ──────────────────────────────────────────────────────────

export LOOPANY_HOME="$WORKSPACE"
$LOOPANY_CLI init >/dev/null 2>&1
echo "✓ Workspace initialized"

# Seed a mission so bootstrap checks pass
$LOOPANY_CLI artifact create --kind mission \
  --slug "skill-regression-test" \
  --title "Test mission: validate skill regression" \
  --content "$(cat <<'CONTENT'
## Thesis
Ensure all 4 loopany skills work end-to-end after installation.

## Key results
- All scenarios pass
CONTENT
)" >/dev/null 2>&1
echo "✓ Test mission seeded"
echo ""

# ── Helpers ─────────────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0

run_claude() {
  local prompt="$1"
  # Use --bare to avoid loading user's own CLAUDE.md and other configs
  # --add-dir gives claude access to the workspace
  # Skills resolve from ~/.claude/skills/ — we temporarily override HOME
  if $DRY_RUN; then
    echo "  [DRY-RUN] claude -p \"${prompt:0:80}...\""
    return 0
  fi

  # Create a temp HOME so only our skills are visible
  local FAKE_HOME="$TMPBASE/home"
  mkdir -p "$FAKE_HOME/.claude/skills"
  # Symlink our skills into the fake HOME
  for skill in loopany-core loopany-reflect loopany-review loopany-capture; do
    ln -sf "$SKILLS_SRC/$skill" "$FAKE_HOME/.claude/skills/$skill"
  done

  HOME="$FAKE_HOME" \
  LOOPANY_HOME="$WORKSPACE" \
  claude -p "$prompt" \
    --bare \
    --allowedTools "Bash Read Write Edit Glob Grep" \
    --permission-mode bypassPermissions \
    --add-dir "$WORKSPACE" \
    --add-dir "$REPO_ROOT" \
    --max-turns 15 \
    2>/dev/null
}

assert_file_exists() {
  local pattern="$1"
  local desc="$2"
  local found
  found=$(find "$WORKSPACE" -path "$pattern" 2>/dev/null | head -1)
  if [[ -n "$found" ]]; then
    echo "  ✓ $desc"
    return 0
  else
    echo "  ✗ $desc (no file matching $pattern)"
    return 1
  fi
}

assert_file_contains() {
  local pattern="$1"
  local content="$2"
  local desc="$3"
  local found
  found=$(find "$WORKSPACE" -path "$pattern" 2>/dev/null | head -1)
  if [[ -z "$found" ]]; then
    echo "  ✗ $desc (file not found: $pattern)"
    return 1
  fi
  if grep -qi "$content" "$found"; then
    echo "  ✓ $desc"
    return 0
  else
    echo "  ✗ $desc (content '$content' not in $found)"
    return 1
  fi
}

assert_artifact_count() {
  local kind="$1"
  local min="$2"
  local desc="$3"
  local count
  # CLI outputs JSON array — count objects with matching kind
  count=$($LOOPANY_CLI artifact list --kind "$kind" 2>/dev/null | grep -c '"kind"' || true)
  # fallback: count files with the kind prefix
  if [[ "$count" -lt "$min" ]]; then
    local prefix
    case "$kind" in
      signal) prefix="sig-" ;;
      task) prefix="tsk-" ;;
      learning) prefix="lrn-" ;;
      note) prefix="nte-" ;;
      mission) prefix="mis-" ;;
      *) prefix="$kind" ;;
    esac
    count=$(find "$WORKSPACE/artifacts" -name "${prefix}*" 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [[ "$count" -ge "$min" ]]; then
    echo "  ✓ $desc (found $count)"
    return 0
  else
    echo "  ✗ $desc (expected ≥$min, found $count)"
    return 1
  fi
}

SHOULD_RUN=false

scenario() {
  local num="$1"
  local name="$2"

  if [[ -n "$ONLY_SCENARIO" && "$ONLY_SCENARIO" != "$num" ]]; then
    echo "[$num] $name — SKIPPED"
    ((SKIP++))
    SHOULD_RUN=false
    return 0
  fi

  echo "[$num] $name"
  SHOULD_RUN=true
}

record() {
  if $DRY_RUN; then
    echo "  [DRY-RUN] assert skipped"
    ((SKIP++))
    return 0
  fi
  if "$@"; then
    ((PASS++))
  else
    ((FAIL++))
  fi
}

dry_skip() {
  # Helper for inline asserts in dry-run mode
  if $DRY_RUN; then
    echo "  [DRY-RUN] assert skipped"
    ((SKIP++))
    return 0
  fi
  return 1
}

# ── Scenarios ───────────────────────────────────────────────────────────────

# Scenario 1: Core — create a signal via natural language
scenario 1 "loopany-core: create a signal"
if $SHOULD_RUN; then
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-core skill (SKILL.md) to understand how to route artifact creation.
Then create a signal artifact about: 'Users are reporting slow page loads on the dashboard — 3 reports this week.'
Make sure to use the loopany CLI to create it." > "$TMPBASE/scenario1.log" 2>&1 || true
  record assert_artifact_count signal 1 "Signal artifact created"
fi

# Scenario 2: Core — create a task with proper body sections
scenario 2 "loopany-core: create a task"
if $SHOULD_RUN; then
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-core skill and the task kind definition at $SKILLS_SRC/loopany-core/kinds/task.md.
Create a task: 'Investigate dashboard slow load reports'.
Then flip it to 'running' status." > "$TMPBASE/scenario2.log" 2>&1 || true
  record assert_artifact_count task 1 "Task artifact created"
fi

# Scenario 3: Core — create a note (fallback kind)
scenario 3 "loopany-core: create a note"
if $SHOULD_RUN; then
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-core skill.
Create a note: 'Decided to use Redis for session caching over Memcached because of built-in TTL support.'
Use the loopany CLI." > "$TMPBASE/scenario3.log" 2>&1 || true
  record assert_artifact_count note 1 "Note artifact created"
fi

# Scenario 4: Capture — quality gate should SKIP trivial work
scenario 4 "loopany-capture: quality gate rejects trivial"
if $SHOULD_RUN; then
  SCENARIO4_BEFORE=$(find "$WORKSPACE/artifacts" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-capture skill to understand the quality gate.
I just fixed a typo in a README — changed 'teh' to 'the'.
Should this be captured as a loopany artifact? Apply the quality gate.
If the quality gate says skip, do NOT create any artifact — just explain why you skipped." > "$TMPBASE/scenario4.log" 2>&1 || true
  SCENARIO4_AFTER=$(find "$WORKSPACE/artifacts" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  if ! dry_skip; then
    if [[ "$SCENARIO4_AFTER" -eq "$SCENARIO4_BEFORE" ]]; then
      echo "  ✓ Quality gate correctly skipped trivial work"
      ((PASS++))
    else
      echo "  ✗ Quality gate should have skipped (before=$SCENARIO4_BEFORE, after=$SCENARIO4_AFTER)"
      ((FAIL++))
    fi
  fi
fi

# Scenario 5: Capture — should capture a shipped PR
scenario 5 "loopany-capture: capture shipped PR as task"
if $SHOULD_RUN; then
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-capture skill to understand event routing.
I just shipped a PR that adds rate limiting to the API. The PR added a token-bucket
algorithm, 100 req/min per user, with Redis backend. It reduced 429 errors by 80%
in staging. Create the appropriate artifact via the loopany CLI." > "$TMPBASE/scenario5.log" 2>&1 || true
  record assert_artifact_count task 2 "PR shipped → task artifact created (total ≥2)"
fi

# Scenario 6: Review — daily review on empty workspace
scenario 6 "loopany-review: daily review (empty follow-ups)"
if $SHOULD_RUN; then
  SCENARIO6_OUT=$(run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-review skill.
Run a daily review: check what follow-ups are due today.
Use the loopany CLI followups command. If nothing is due, say so clearly." 2>&1 || true)
  if ! dry_skip; then
    if echo "$SCENARIO6_OUT" | grep -qi "nothing\|no.*due\|empty\|0 items\|no follow"; then
      echo "  ✓ Daily review correctly reports nothing due"
      ((PASS++))
    else
      echo "  ✗ Daily review should report nothing due"
      echo "    (output excerpt: ${SCENARIO6_OUT:0:200})"
      ((FAIL++))
    fi
  fi
fi

# Scenario 7: Review — weekly doctor check
scenario 7 "loopany-review: weekly doctor"
if $SHOULD_RUN; then
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-review skill.
Run a weekly review. Use the loopany doctor command and check for overdue items
and parking lots. Summarize findings." > "$TMPBASE/scenario7.log" 2>&1 || true
  if ! dry_skip; then
    if [[ -f "$TMPBASE/scenario7.log" ]] && [[ -s "$TMPBASE/scenario7.log" ]]; then
      echo "  ✓ Weekly review completed without error"
      ((PASS++))
    else
      echo "  ✗ Weekly review failed to produce output"
      ((FAIL++))
    fi
  fi
fi

# Scenario 8: Reflect — not enough evidence, should decline
scenario 8 "loopany-reflect: refuse to reflect on <3 tasks"
if $SHOULD_RUN; then
  SCENARIO8_BEFORE=$(find "$WORKSPACE/artifacts" -name "lrn-*" 2>/dev/null | wc -l | tr -d ' ')
  run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-reflect skill.
Run a reflect cycle: gather recent task outcomes and look for patterns.
Follow the reflect skill's threshold requirements strictly — if there are fewer
than 3 completed tasks with outcomes, do NOT create a learning. Just report
that there isn't enough evidence yet." > "$TMPBASE/scenario8.log" 2>&1 || true
  SCENARIO8_AFTER=$(find "$WORKSPACE/artifacts" -name "lrn-*" 2>/dev/null | wc -l | tr -d ' ')
  if ! dry_skip; then
    if [[ "$SCENARIO8_AFTER" -eq "$SCENARIO8_BEFORE" ]]; then
      echo "  ✓ Reflect correctly declined — insufficient evidence"
      ((PASS++))
    else
      echo "  ✗ Reflect should not have created a learning (before=$SCENARIO8_BEFORE, after=$SCENARIO8_AFTER)"
      ((FAIL++))
    fi
  fi
fi

# Scenario 9: Cross-skill — signal → task upgrade
scenario 9 "Cross-skill: upgrade signal to task"
if $SHOULD_RUN; then
  SIG_ID=$($LOOPANY_CLI artifact list --kind signal 2>/dev/null | grep -o 'sig-[0-9T-]*' | head -1 || true)
  if [[ -n "$SIG_ID" ]]; then
    run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-core skill and the signal kind playbook at $SKILLS_SRC/loopany-core/kinds/signal.md.
Signal $SIG_ID has recurred 3 times and needs to be upgraded to a task.
Create a new task that addresses this signal, and mark the signal as 'addressed'.
Use the loopany CLI for all operations." > "$TMPBASE/scenario9.log" 2>&1 || true
    if ! dry_skip; then
      SIG_FILE=$(find "$WORKSPACE/artifacts" -name "${SIG_ID}*" 2>/dev/null | head -1)
      if [[ -n "$SIG_FILE" ]] && grep -qi "addressed\|done" "$SIG_FILE"; then
        echo "  ✓ Signal marked as addressed"
        ((PASS++))
      else
        echo "  ✗ Signal should be marked addressed"
        ((FAIL++))
      fi
    fi
  else
    if ! dry_skip; then
      echo "  ✗ No signal found from scenario 1 — cannot test upgrade"
      ((FAIL++))
    fi
  fi
fi

# Scenario 10: Kind routing — verify the agent reads the right kind file
scenario 10 "Kind routing: agent reads correct kind before creating"
if $SHOULD_RUN; then
  SCENARIO10_OUT=$(run_claude "You have access to the loopany CLI at: bun $REPO_ROOT/src/cli.ts
The workspace is at \$LOOPANY_HOME ($WORKSPACE).
Use 'LOOPANY_HOME=$WORKSPACE bun $REPO_ROOT/src/cli.ts' as the command prefix.

Read the loopany-core SKILL.md first.
I noticed that our competitor launched a similar feature. I can't act on it now.
What kind of artifact should this be? Explain your routing decision based on
the loopany-core decision rule, then create it." 2>&1 || true)
  if ! dry_skip; then
    if echo "$SCENARIO10_OUT" | grep -qi "signal"; then
      echo "  ✓ Correctly routed to signal kind"
      ((PASS++))
    else
      echo "  ✗ Should have routed to signal kind"
      ((FAIL++))
    fi
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed, $SKIP skipped"
echo "════════════════════════════════════════"
echo ""
echo "Workspace preserved at: $WORKSPACE"
echo "Logs at: $TMPBASE/scenario*.log"

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "To inspect failures, check the scenario logs:"
  echo "  cat $TMPBASE/scenario<N>.log"
  # Don't clean up on failure
  trap - EXIT
  exit 1
fi
