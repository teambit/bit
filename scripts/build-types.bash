#!/bin/bash
set -e
node_modules/.bin/tsc --project tsconfig.types.json
mv types/src/*  types/
rm -r types/src
cp -rl types/* dist
rm -rf types
