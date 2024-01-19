#!/usr/bin/env bash
set -ex

# check whether files in "scopes" directory has the word "ramda" in them
# if found, exit with error
if grep -R "ramda" scopes; then
  echo "ramda is not allowed in bit"
  exit 1
fi
