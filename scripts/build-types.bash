#!/bin/bash
set -e
node_modules/.bin/tsc --project tsconfig.types.json
cd types/src
mv * ../
cd ../
rm -r src
cd ..
cp -rl types/* dist
rm -rf types
