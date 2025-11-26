#!/bin/bash

# This script validates that env versions in .bitmap match cache keys in .circleci/config.yml
# It prevents stale caches when env versions are upgraded

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Checking env cache synchronization..."

# Extract core-aspect-env version from .bitmap
CORE_ASPECT_ENV_VERSION=$(grep -o 'teambit.harmony/envs/core-aspect-env@[0-9.]*' .bitmap | head -1 | sed 's/.*@//')

if [ -z "$CORE_ASPECT_ENV_VERSION" ]; then
  echo "No core-aspect-env found in .bitmap, skipping validation"
  exit 0
fi

echo "Found core-aspect-env version in .bitmap: $CORE_ASPECT_ENV_VERSION"

# Check if this version exists in .circleci/config.yml cache keys
# Pattern: core-aspect-env-v{VERSION}-v{ANY_NUMBER}
CACHE_KEY_PATTERN="core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v[0-9]+"

if grep -E "$CACHE_KEY_PATTERN" .circleci/config.yml > /dev/null; then
  FOUND_KEY=$(grep -oE "core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v[0-9]+" .circleci/config.yml | head -1)
  echo -e "${GREEN}✓ Cache key matches: $FOUND_KEY${NC}"
  exit 0
else
  echo -e "${RED}✗ ERROR: Cache key mismatch!${NC}"
  echo -e "${YELLOW}Expected cache key pattern: core-aspect-env-v${CORE_ASPECT_ENV_VERSION}-v*${NC}"
  echo ""
  echo "Current cache keys in .circleci/config.yml:"
  grep -oE 'core-aspect-env-v[0-9.]+-v[0-9]+' .circleci/config.yml | sort -u
  echo ""
  echo -e "${RED}When upgrading envs, you must update the cache keys in .circleci/config.yml${NC}"
  echo "Please update all instances of 'core-aspect-env-v*' to match the version in .bitmap"
  exit 1
fi
