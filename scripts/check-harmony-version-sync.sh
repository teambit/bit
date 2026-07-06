#!/bin/bash

# This script validates that the @teambit/harmony version is consistent across
# workspace.jsonc and the two bundle-install overrides in .circleci/config.yml.
#
# Why this can drift: workspace.jsonc pins harmony for the dev workspace build,
# while .circleci/config.yml re-pins it via `pnpm.overrides.@teambit/harmony`
# for the freshly-installed published `@teambit/bit` bundle used by e2e. Both
# must reference the SAME harmony version so e2e exercises what the workspace
# built with. It's easy to bump one and forget the other.
#
# Usage:
#   ./scripts/check-harmony-version-sync.sh         # validate (used by CI); exits 1 on mismatch
#   ./scripts/check-harmony-version-sync.sh --fix   # rewrite the config.yml overrides to match workspace.jsonc

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FIX=false
if [ "${1:-}" = "--fix" ]; then
  FIX=true
fi

WORKSPACE_FILE="workspace.jsonc"
CONFIG_FILE=".circleci/config.yml"

echo "Checking @teambit/harmony version synchronization..."

# Source of truth: the harmony pins in workspace.jsonc. There are two (the
# dependency policy and the dependency-resolver overrides); they must agree.
WS_VERSIONS=$(grep -oE '"@teambit/harmony": *"[0-9]+\.[0-9]+\.[0-9]+"' "$WORKSPACE_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)

if [ -z "$WS_VERSIONS" ]; then
  echo -e "${RED}✗ ERROR: no @teambit/harmony pin found in ${WORKSPACE_FILE}${NC}"
  exit 1
fi

# Count AFTER the empty-check: under `set -e`, `grep -c .` on empty input exits non-zero and would abort
# the script before the friendly error above. Here WS_VERSIONS is guaranteed non-empty, so this is safe.
WS_COUNT=$(echo "$WS_VERSIONS" | grep -c .)
if [ "$WS_COUNT" -ne 1 ]; then
  echo -e "${RED}✗ ERROR: ${WORKSPACE_FILE} has inconsistent @teambit/harmony pins:${NC}"
  echo "$WS_VERSIONS" | sed 's/^/  /'
  echo -e "${YELLOW}Fix workspace.jsonc first so all @teambit/harmony pins match, then re-run.${NC}"
  exit 1
fi

EXPECTED="$WS_VERSIONS"
echo "Found @teambit/harmony in ${WORKSPACE_FILE}: $EXPECTED"

# The config.yml overrides look like:
#   pnpm.overrides.@teambit/harmony" --values "0.4.12"
CONFIG_VERSIONS=$(grep -oE 'pnpm\.overrides\.@teambit/harmony" --values "[0-9]+\.[0-9]+\.[0-9]+"' "$CONFIG_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)

if [ -z "$CONFIG_VERSIONS" ]; then
  echo -e "${RED}✗ ERROR: no 'pnpm.overrides.@teambit/harmony' override found in ${CONFIG_FILE}${NC}"
  exit 1
fi

if [ "$CONFIG_VERSIONS" = "$EXPECTED" ]; then
  echo -e "${GREEN}✓ config.yml overrides match: @teambit/harmony@${EXPECTED}${NC}"
  exit 0
fi

# Mismatch.
if [ "$FIX" = true ]; then
  # Rewrite every harmony override version in config.yml to EXPECTED.
  # Temp file next to the target (explicit template for BSD/macOS portability)
  # so the final mv is an atomic same-filesystem rename.
  TMP=$(mktemp "${CONFIG_FILE}.XXXXXX")
  trap 'rm -f "$TMP"' EXIT
  sed -E "s|(pnpm\.overrides\.@teambit/harmony\" --values \")[0-9]+\.[0-9]+\.[0-9]+(\")|\1${EXPECTED}\2|g" "$CONFIG_FILE" > "$TMP"
  mv "$TMP" "$CONFIG_FILE"

  NEW_VERSIONS=$(grep -oE 'pnpm\.overrides\.@teambit/harmony" --values "[0-9]+\.[0-9]+\.[0-9]+"' "$CONFIG_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)
  if [ "$NEW_VERSIONS" = "$EXPECTED" ]; then
    echo -e "${GREEN}✓ Updated @teambit/harmony overrides in ${CONFIG_FILE} to ${EXPECTED}${NC}"
    exit 0
  fi
  echo -e "${RED}✗ --fix failed to update overrides in ${CONFIG_FILE}${NC}"
  exit 1
fi

echo -e "${RED}✗ ERROR: @teambit/harmony version mismatch!${NC}"
echo -e "${YELLOW}${WORKSPACE_FILE} has @teambit/harmony@${EXPECTED}, but ${CONFIG_FILE} has:${NC}"
echo "$CONFIG_VERSIONS" | sed 's/^/  /'
echo ""
echo -e "${YELLOW}Run: ./scripts/check-harmony-version-sync.sh --fix${NC}"
exit 1
