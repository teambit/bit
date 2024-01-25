#!/usr/bin/env bash
set -ex

# check whether files in "scopes" directory has the word "ramda" in them
# ignore any node_modules directory
# if found, exit with error
if grep -R "ramda" --exclude-dir "node_modules" scopes; then
  echo "ramda is not allowed in bit"
  exit 1
fi
