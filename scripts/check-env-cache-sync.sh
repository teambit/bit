#!/bin/bash

# This script validates that env versions in .bitmap match cache keys in .circleci/config.yml
# It prevents stale caches when env versions are upgraded.
#
# Usage:
#   ./scripts/check-env-cache-sync.sh         # validate (used by CI); exits 1 on mismatch
#   ./scripts/check-env-cache-sync.sh --fix   # rewrite the cache keys to match .bitmap,
#                                              # preserving each key's -v<n> cache-bust suffix

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FIX=false
if [ "${1:-}" = "--fix" ]; then
  FIX=true
fi

CONFIG_FILE=".circleci/config.yml"

echo "Checking env cache synchronization..."

# Extract core-aspect-env version from .bitmap. `bit env update` writes a config
# entry for every affected component, e.g.:
#   "teambit.harmony/envs/core-aspect-env@0.1.6": {}
# These entries are only present while an env change is in flight; on a normal
# branch .bitmap has none and we skip (nothing to validate).
CORE_ASPECT_ENV_VERSION=$(grep -o 'teambit.harmony/envs/core-aspect-env@[0-9.]*' .bitmap | head -1 | sed 's/.*@//')

if [ -z "$CORE_ASPECT_ENV_VERSION" ]; then
  echo "No core-aspect-env found in .bitmap, skipping validation"
  exit 0
fi

echo "Found core-aspect-env version in .bitmap: $CORE_ASPECT_ENV_VERSION"

# Cache keys look like: core-aspect-env-v{VERSION}-v{BUMP}
# {VERSION} must match .bitmap; {BUMP} is a manual cache-bust counter we preserve.
CACHE_KEY_PATTERN="core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v[0-9]+"

if grep -qE "$CACHE_KEY_PATTERN" "$CONFIG_FILE"; then
  FOUND_KEY=$(grep -oE "core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v[0-9]+" "$CONFIG_FILE" | head -1)
  echo -e "${GREEN}✓ Cache key matches: $FOUND_KEY${NC}"
  exit 0
fi

# Mismatch: the cache keys point at a different env version than .bitmap.
EXISTING_KEYS=$(grep -oE 'core-aspect-env-v[0-9.]+-v[0-9]+' "$CONFIG_FILE" | sort -u)

if [ "$FIX" = true ]; then
  # Rewrite only the version segment, keeping each key's -v{BUMP} suffix intact,
  # so the manual cache-bust counter can never be dropped by accident.
  # Create the temp file next to the target (explicit template for BSD/macOS
  # portability) so the final mv is an atomic same-filesystem rename.
  TMP=$(mktemp "${CONFIG_FILE}.XXXXXX")
  trap 'rm -f "$TMP"' EXIT
  sed -E "s/core-aspect-env-v[0-9.]+-v([0-9]+)/core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v\1/g" "$CONFIG_FILE" > "$TMP"
  mv "$TMP" "$CONFIG_FILE"

  if grep -qE "$CACHE_KEY_PATTERN" "$CONFIG_FILE"; then
    NEW_KEYS=$(grep -oE 'core-aspect-env-v[0-9.]+-v[0-9]+' "$CONFIG_FILE" | sort -u)
    echo -e "${GREEN}✓ Updated cache keys in ${CONFIG_FILE}${NC}"
    echo "  from: $(echo "$EXISTING_KEYS" | tr '\n' ' ')"
    echo "  to:   $(echo "$NEW_KEYS" | tr '\n' ' ')"
    exit 0
  fi

  echo -e "${RED}✗ --fix found no 'core-aspect-env-v*-v*' cache keys to update in ${CONFIG_FILE}${NC}"
  exit 1
fi

echo -e "${RED}✗ ERROR: Cache key mismatch!${NC}"
echo -e "${YELLOW}.bitmap has core-aspect-env@${CORE_ASPECT_ENV_VERSION}, but ${CONFIG_FILE} has:${NC}"
echo "$EXISTING_KEYS" | sed 's/^/  /'
echo ""
echo -e "${YELLOW}Run: ./scripts/check-env-cache-sync.sh --fix${NC}"
echo "  (rewrites the keys to core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v<n>, keeping the existing -v<n> cache-bust suffix)"
exit 1
