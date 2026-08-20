#!/bin/bash
# PreToolUse guard for Claude Code: deny any `git push` that targets master or main.
# Receives the hook JSON on stdin; prints a deny decision when blocked, nothing otherwise.

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

# Examine only the `git push ...` segment(s) of the command, with quoted strings removed,
# so unrelated prose (commit messages, PR bodies mentioning master) doesn't false-positive.
# Not airtight against deliberately quoted refs - the .husky/pre-push hook backstops those.
push_segments=$(printf '%s' "$cmd" | sed "s/'[^']*'//g"' ; s/"[^"]*"//g ; s/&&/\n/g; s/;/\n/g; s/|/\n/g' | grep 'git push')

# explicit master/main as a standalone word (branch arg or refspec), incl. refs/heads/ form
if printf '%s' "$push_segments" | grep -qE '(^|[^A-Za-z0-9_/.-])(master|main)([^A-Za-z0-9_.-]|$)' ||
  printf '%s' "$push_segments" | grep -qE 'refs/heads/(master|main)([^A-Za-z0-9_.-]|$)'; then
  deny "Blocked: this git push references master/main. Never push to master/main — create a feature branch and open a PR instead."
fi

# bare `git push` (no explicit master/main): deny when the current branch is master/main
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
case "$branch" in
  master|main)
    deny "Blocked: the current branch is $branch, so this push would update $branch. Move the work to a feature branch (git branch feat-x && git reset --hard origin/$branch && git checkout feat-x) and open a PR."
    ;;
esac
exit 0
