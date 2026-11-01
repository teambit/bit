#!/bin/bash
# CI entry point: fails when a change adds a circular dependency between workspace components.
set -e
cd "$(dirname "$0")"
echo "Commit: ${CIRCLE_SHA1:-$(git rev-parse HEAD)}"
node check-cycles.js
