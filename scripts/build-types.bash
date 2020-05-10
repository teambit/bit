#!/bin/bash
set -e
rm -rf types
node_modules/.bin/tsc --project tsconfig.types.json
cp -r types/src/* dist
rm -rf types
