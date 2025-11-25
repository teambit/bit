#!/usr/bin/env bash
set -ex

# check whether files in "scopes" directory has the word "ramda" in them
# ignore any node_modules directory
# if found, exit with error
if grep -R -E "import[ ]([a-zA-Z]*)Aspect" --exclude-dir "node_modules" scopes; then
  echo "import *Aspect from the default export is not allowed in bit, please use named imports (import { AspectNameAspect } from 'aspect-package')"
  exit 1
fi
