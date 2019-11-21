#!/bin/bash
set -e
rm -rf types
node_modules/.bin/tsc --project tsconfig.types.json
mv types/src/*  types/
rm -r types/src
cp -r types/* dist
rm -rf types
