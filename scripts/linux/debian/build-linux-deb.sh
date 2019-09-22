#!/bin/bash
set -ex
# Ensure all the tools we need are available
ensureAvailable() {
  command -v "$1" >/dev/null 2>&1 || (echo "You need to install $1" && exit 2)
}
# ensureAvailable dpkg-deb
ensureAvailable fpm
# ensureAvailable fakeroot
# ensureAvailable rpmbuild
VERSION=$(cat ./package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | xargs echo -n)
fpm -s dir -t deb -n bit -p ./releases/deb --vendor 'Cocycles, LTD <team@bit.dev>' --maintainer 'Cocycles, LTD <team@bit.dev>' --version $VERSION --url https://bit.dev --description 'Easily share code between projects with your team' ./releases/bit-bin-linux=/usr/local/bin/bit