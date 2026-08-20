#!/bin/bash

# This script validates that the @teambit/harmony version is consistent across
# workspace.jsonc and the bundle-install override in .circleci/config.yml.
#
# Why this can drift: workspace.jsonc pins harmony for the dev workspace build,
# while .circleci/config.yml re-pins it in the `overrides` object it hands to
# `pnpm config set` for the freshly-installed published `@teambit/bit` bundle
# used by e2e. Both must reference the SAME harmony version so e2e exercises
# what the workspace built with. It's easy to bump one and forget the other.
#
# Usage:
#   ./scripts/check-harmony-version-sync.sh         # validate (used by CI); exits 1 on mismatch
#   ./scripts/check-harmony-version-sync.sh --fix   # rewrite the config.yml override to match workspace.jsonc

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

# The config.yml override is a line of the JSON object passed to `pnpm config set overrides`:
#   "@teambit/harmony": "0.4.12",
# There is one, in the single bundle-install step both platforms share.
EXPECTED_CONFIG_OVERRIDES=1
# `|| true`: the pipeline ends in grep (no trailing sort), so with no matches it would exit non-zero
# and abort under `set -e` before the friendly empty-check below.
CONFIG_MATCHES=$(grep -oE '"@teambit/harmony": *"[0-9]+\.[0-9]+\.[0-9]+"' "$CONFIG_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)

if [ -z "$CONFIG_MATCHES" ]; then
  echo -e "${RED}✗ ERROR: no '@teambit/harmony' override found in ${CONFIG_FILE}${NC}"
  exit 1
fi

# Guard against a false "in sync": `sort -u` below would hide a renamed or duplicated override, so
# require exactly the expected number of overrides before comparing versions.
CONFIG_COUNT=$(echo "$CONFIG_MATCHES" | grep -c .)
if [ "$CONFIG_COUNT" -ne "$EXPECTED_CONFIG_OVERRIDES" ]; then
  echo -e "${RED}✗ ERROR: expected ${EXPECTED_CONFIG_OVERRIDES} @teambit/harmony override in ${CONFIG_FILE}, found ${CONFIG_COUNT}${NC}"
  echo -e "${YELLOW}The bundle-install step must pin @teambit/harmony in its overrides object.${NC}"
  exit 1
fi

CONFIG_VERSIONS=$(echo "$CONFIG_MATCHES" | sort -u)

if [ "$CONFIG_VERSIONS" = "$EXPECTED" ]; then
  echo -e "${GREEN}✓ config.yml override matches: @teambit/harmony@${EXPECTED}${NC}"
  exit 0
fi

# Mismatch.
if [ "$FIX" = true ]; then
  # Rewrite every harmony override version in config.yml to EXPECTED.
  # Temp file next to the target (explicit template for BSD/macOS portability)
  # so the final mv is an atomic same-filesystem rename.
  TMP=$(mktemp "${CONFIG_FILE}.XXXXXX")
  trap 'rm -f "$TMP"' EXIT
  sed -E "s|(\"@teambit/harmony\": *\")[0-9]+\.[0-9]+\.[0-9]+(\")|\1${EXPECTED}\2|g" "$CONFIG_FILE" > "$TMP"
  mv "$TMP" "$CONFIG_FILE"

  NEW_VERSIONS=$(grep -oE '"@teambit/harmony": *"[0-9]+\.[0-9]+\.[0-9]+"' "$CONFIG_FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)
  if [ "$NEW_VERSIONS" = "$EXPECTED" ]; then
    echo -e "${GREEN}✓ Updated the @teambit/harmony override in ${CONFIG_FILE} to ${EXPECTED}${NC}"
    exit 0
  fi
  echo -e "${RED}✗ --fix failed to update the override in ${CONFIG_FILE}${NC}"
  exit 1
fi

echo -e "${RED}✗ ERROR: @teambit/harmony version mismatch!${NC}"
echo -e "${YELLOW}${WORKSPACE_FILE} has @teambit/harmony@${EXPECTED}, but ${CONFIG_FILE} has:${NC}"
echo "$CONFIG_VERSIONS" | sed 's/^/  /'
echo ""
echo -e "${YELLOW}Run: ./scripts/check-harmony-version-sync.sh --fix${NC}"
exit 1
