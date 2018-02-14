#!/bin/sh
BIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "bit branch: $BIT_BRANCH"
BIT_JS_BRANCH_EXISTS=$(git ls-remote --heads https://github.com/teambit/bit-javascript "$BIT_BRANCH" | wc -l)
BIT_JS_BRANCH="master"

if [ "$BIT_JS_BRANCH_EXISTS" -eq "1" ]; then
   BIT_JS_BRANCH="$BIT_BRANCH";
fi
echo "cloneing bit javascript: $BIT_JS_BRANCH"

cd ../

git clone --depth 1 https://github.com/teambit/bit-javascript -b "$BIT_JS_BRANCH"

cd ./bit-javascript

git rev-parse HEAD > commit-hash
