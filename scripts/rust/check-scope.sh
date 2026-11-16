#!/usr/bin/env bash
# Keeps the Rust CLI's footprint on the Node.js repository: compared with its
# merge base on teambit/bit master, the branch may change only native/ and the
# Rust CLI's own workflow, docs and scripts. The in-process integration it
# replaced (the napi addon, the helper binaries, the Node.js glue) must not
# come back. Usage: check-scope.sh <upstream master ref>
set -euo pipefail
upstream="${1:?usage: check-scope.sh <upstream master ref>}"
base=$(git merge-base HEAD "$upstream")
allowed='^(native/|docs/rust-cli\.md$|docs/rust/|scripts/rust/|\.github/workflows/rust(-scope)?\.yml$)'
status=0
outside=$(git diff --name-only "$base" HEAD | grep -Ev "$allowed" || true)
if [ -n "$outside" ]; then
  echo "These files differ from teambit/bit master but are outside the Rust CLI's paths:"
  echo "$outside" | sed 's/^/  /'
  echo "The Node.js CLI must stay unchanged; see docs/rust-cli.md."
  status=1
fi
if [ -e native/workspace-napi ] || grep -q 'workspace-napi' native/Cargo.toml; then
  echo "native/workspace-napi was removed with the in-process integration; it must not come back."
  status=1
fi
binaries=$(cd native && ls -d */src/main.rs */src/bin 2>/dev/null | grep -v '^cli/' || true)
if [ -n "$binaries" ]; then
  echo "Only the CLI builds a binary; these crates add one:"
  echo "$binaries" | sed 's/^/  /'
  status=1
fi
if [ "$status" = 0 ]; then
  echo "The branch changes only the Rust CLI's paths ($(git diff --name-only "$base" HEAD | wc -l) files since $base)."
fi
exit "$status"
