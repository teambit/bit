#!/usr/bin/env bash
# Install a locally built pnpm Rust engine (`pacquet-napi`) over the released
# `@pnpm/napi` packages in this workspace's node_modules.
#
# The `enableGlobalVirtualStore`, `packageExtensions` and `patchedDependencies`
# options this branch passes to `install()` are not in the published
# 12.0.0-beta.4 binding yet (see pnpm/pnpm#13648), so a checkout of pnpm has to
# supply them until a release carries them. Once it does, this script and the
# whole step go away.
#
# Usage:
#   (cd /path/to/pnpm && cargo build -p pacquet-napi --release)
#   PNPM_REPO=/path/to/pnpm scripts/link-local-pnpm-engine.sh
#
# Re-run after every `bit install`, which restores the published files.
set -euo pipefail

if [ -z "${PNPM_REPO:-}" ]; then
  echo "set PNPM_REPO to a pnpm checkout, e.g. PNPM_REPO=~/src/pnpm $0" >&2
  exit 1
fi
BIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SO="$PNPM_REPO/target/release/libpacquet_napi.so"
if [ ! -f "$SO" ]; then
  echo "no built engine at $SO — run: (cd $PNPM_REPO && cargo build -p pacquet-napi --release)" >&2
  exit 1
fi

shopt -s nullglob

# The platform package's addon wins over any local artifact in the loader's
# candidate order, so the binary has to replace *that* file. Delete before
# copying: the file is hardlinked into pnpm's content-addressable store, and
# writing through the link would corrupt the store copy too.
found=0
for dir in "$BIT_ROOT"/node_modules/.pnpm/@pnpm+napi.linux-x64@*/node_modules/@pnpm/napi.linux-x64; do
  rm -f "$dir/pnpm-napi.node"
  cp "$SO" "$dir/pnpm-napi.node"
  echo "engine  -> $dir/pnpm-napi.node"
  found=1
done

for dir in "$BIT_ROOT"/node_modules/.pnpm/@pnpm+napi@*/node_modules/@pnpm/napi; do
  rm -f "$dir/index.d.ts"
  cp "$PNPM_REPO/pnpm/npm/napi/index.d.ts" "$dir/index.d.ts"
  rm -f "$dir/index.js"
  cp "$PNPM_REPO/pnpm/npm/napi/index.js" "$dir/index.js"
  echo "typings -> $dir/index.d.ts"
  found=1
done

if [ "$found" = 0 ]; then
  echo "no @pnpm/napi packages found under $BIT_ROOT/node_modules/.pnpm" >&2
  exit 1
fi
