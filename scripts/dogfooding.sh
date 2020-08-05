#!/usr/bin/env bash

rm -rf extensions
rm -rf components
mkdir extensions
mkdir components
cp -R src/extensions/* extensions
cp -R src/components/* components
rm .bitmap
bit init --harmony
bit add extensions/*
bit add components/utils/* -n utils
bit add components/stage-components/workspace-components/* -n staged-components/workspace-components
bit add components/stage-components/workspace-sections/* -n staged-components/workspace-sections
bit add components/stage-components/* -n staged-components
bit link --rewire
find extensions/*/*.* -type f -exec sed -i '' "s/'..\/..\//'bit-bin\//g" {} \;
find extensions/*/*/*.* -type f -exec sed -i '' "s/'..\/..\/..\//'bit-bin\//g" {} \;
find extensions/*/*/*/*.* -type f -exec sed -i '' "s/'..\/..\/..\/..\//'bit-bin\//g" {} \;
find components/*/*/*.* -type f -exec sed -i '' "s/'..\/..\/..\//'bit-bin\//g" {} \;
find components/*/*/*/*.* -type f -exec sed -i '' "s/'..\/..\/..\/..\//'bit-bin\//g" {} \;
find components/*/*/*/*/*.* -type f -exec sed -i '' "s/'..\/..\/..\/..\/..\//'bit-bin\//g" {} \;
rm -rf node_modules/bit-bin
ln -s `pwd`/dist node_modules/bit-bin