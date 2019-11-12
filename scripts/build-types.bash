#!/bin/bash
set -e
tsc --project tsconfig.types.json
cd types/src
mv * ../
cd ../
rm -r src
cd ..
