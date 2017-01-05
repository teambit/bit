#!/usr/bin/env bash
set -ex


rm -rf ../*.tar.gz
rm -rf ../distribution
ver=$(cat ../package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | xargs echo -n)
tarName="bit-${ver}.tar.gz"

npm install  --prefix ../ 
npm run build  --prefix ../

umask 0022
cd ..
#set package json with corret packeing type
packageDest=$(cd $(dirname "$1") && pwd -P)/$(basename "package.json")
node ./scripts/set-installation-method.js $packageDest tar
tar --exclude='./Jenkinsfile' --exclude='./distribution/' --exclude='./scripts/' -zcvf ${tarName} *
shasum -a 256 -b $tarName