#!/usr/bin/env bash

rm -rf extensions
mkdir extensions
cp -R src/extensions/* extensions
rm .bitmap
bit init --harmony
bit add extensions/*
bit link --rewire
find extensions/ -type f -exec sed -i '' "s/'..\/..\/..\//'bit-bin\//g" {} \;
find extensions/ -type f -exec sed -i '' "s/'..\/..\//'bit-bin\//g" {} \;
find extensions/ -type f -exec sed -i '' "s/'bit-bin\/runtime/'..\/..\/runtime/g" {} \;
find extensions/ -type f -exec sed -i '' "s/'bit-bin\/workspace.ui/'..\/..\/workspace.ui/g" {} \;
rm -rf node_modules/bit-bin
ln -s `pwd`/dist node_modules/bit-bin