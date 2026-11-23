#!/usr/bin/env bash
# Dylint 6 resolves the historical Clippy branch by its old local name.
set -euo pipefail
real_git=${DYLINT_REAL_GIT:?DYLINT_REAL_GIT must name the original git executable}
if [[ ${1-} == clone && ( ${2-} == https://github.com/rust-lang/rust-clippy || ${2-} == https://github.com/rust-lang/rust-clippy.git ) ]]; then
  "$real_git" "$@"
  destination=${3:?missing clone destination}
  if ! "$real_git" -C "$destination" show-ref --verify --quiet refs/heads/master; then
    branch=main
    if "$real_git" -C "$destination" show-ref --verify --quiet refs/remotes/origin/master; then
      branch=master
    fi
    "$real_git" -C "$destination" branch master "refs/remotes/origin/$branch"
  fi
  exit 0
fi
exec "$real_git" "$@"
