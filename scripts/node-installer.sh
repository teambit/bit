#!/usr/bin/env bash
set -ex

OS=$1

if  [ "$OS" == "linux" ]; then
	url="https://nodejs.org/dist/v6.10.0/node-v6.10.0-linux-x64.tar.xz"
elif [ "$OS" == "mac" ]; then
	 url="https://nodejs.org/dist/v6.10.0/node-v6.10.0-darwin-x64.tar.gz"
fi


rm -rf ./nodeBin
mkdir -p  ./nodeBin
pushd .
cd nodeBin
wget $url
tar  --strip-components=1  -xf node*
popd
pwd
cp nodeBin/bin/node ./bin
chmod +x ./bin/node
rm -rf ./nodeBin
