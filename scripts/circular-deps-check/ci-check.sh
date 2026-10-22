#!/bin/bash
# CI entry point: fails when a change adds a circular dependency between workspace components.
set -e
cd "$(dirname "$0")"
echo "Commit: ${CIRCLE_SHA1:-$(git rev-parse HEAD)}"

# Diagnostics: confirm which bit binary/version actually runs the check below, and where it's
# pointed. BIT_BIN overrides the binary check-cycles.js invokes (mirrors e2e's --bit_bin) - set it
# to compare the repo's own binary against a bvm-linked release when narrowing a difference.
RESOLVED_BIT_BIN="${BIT_BIN:-bit}"
echo "bit binary: $(command -v "$RESOLVED_BIT_BIN")"
"$RESOLVED_BIT_BIN" --version
echo "hub_domain: $("$RESOLVED_BIT_BIN" config get hub_domain)"
echo ""

node check-cycles.js
