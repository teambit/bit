#!/usr/bin/env bash
# PreToolUse(Bash) guard: blocks `npm run e2e-test[:debug]` when no `.only`
# marker has been added in e2e/. Without `.only` the full e2e suite runs for
# hours. See CLAUDE.md ("Running specific e2e tests").
set -uo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

# Strip quoted substrings so that `npm run e2e-test` inside a quoted argument
# (commit message, echo arg, JSON literal, etc.) is not treated as a real
# command invocation. Naive — doesn't handle escaped or nested quotes — but
# covers the common false-positive sources.
STRIPPED=$(printf '%s' "$CMD" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")

# Match `npm run e2e-test` or `npm run e2e-test:debug` only when `npm` sits at
# the start of a real shell command — start-of-string, or after a separator
# (`;`, `&`, `|`).
if ! printf '%s' "$STRIPPED" | grep -qE '(^|[;&|][[:space:]]*)npm[[:space:]]+run[[:space:]]+e2e-test(:debug)?([^[:alnum:]_:-]|$)'; then
  exit 0
fi

# Look at the working tree (staged + unstaged) for newly-added .only markers
# inside e2e/. Restricting to e2e/ avoids false positives from fixture
# strings elsewhere (e.g. mocha-tester.e2e.ts embeds an `it.only(...)` as
# a string fixture).
if git diff HEAD -- 'e2e/' 2>/dev/null | grep -qE '^\+[^+].*(describe|context|it)\.only\b'; then
  exit 0
fi

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Refusing to run e2e tests: no .only marker found in `git diff HEAD -- e2e/`. CLAUDE.md requires adding `describe.only` or `it.only` to the target test before running e2e, otherwise the full suite runs for hours. Add .only to the specific test, then retry."}}
JSON
