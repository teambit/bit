#!/bin/bash

set -ex

# Ensure all the tools we need are available
ensureAvailable() {
  command -v "$1" >/dev/null 2>&1 || (echo "You need to install $1" && exit 2)
}
ensureAvailable dpkg-deb
ensureAvailable fpm
ensureAvailable fakeroot


PACKAGE_TMPDIR=../distribution/debian_pkg
VERSION=$(cat ../package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | xargs echo -n)
TARBALL_NAME=../bit-$VERSION.tar.gz
DEB_PACKAGE_NAME=bit_$VERSION'_all.deb'
BIT_PACKAGE_NAME=bit_$VERSION'_deb.deb'
if [ ! -e $TARBALL_NAME ]; then
  echo "Hey! Listen! You need to run build-dist.sh first."
  exit 1
fi;



# Extract to a temporary directory
rm -rf $PACKAGE_TMPDIR
mkdir -p $PACKAGE_TMPDIR/bit
umask 0022 # Ensure permissions are correct (0755 for dirs, 0644 for files)
tar zxf $TARBALL_NAME -C $PACKAGE_TMPDIR/bit
PACKAGE_TMPDIR_ABSOLUTE=$(cd $(dirname "$1") && pwd -P)/$PACKAGE_TMPDIR

# Create Linux package structure
mkdir -p $PACKAGE_TMPDIR/usr/share/bit/
mv $PACKAGE_TMPDIR/bit/* $PACKAGE_TMPDIR/usr/share/bit

rm -rf $PACKAGE_TMPDIR/bit
# Common FPM parameters for all packages we'll build using FPM
FPM="fpm --input-type dir --chdir . --name bit --version $VERSION "`
  `"--vendor 'Bit Contributors <team@cocycles.com>' --maintainer 'Bit Contributors <team@cocycles.com>' "`
  `"--url https://bitsrc.io/ --license BSD --description jaja --after-install ../../scripts/linux/postInstall.sh"

#### Build DEB (Debian, Ubuntu) package
node ./set-installation-method.js $PACKAGE_TMPDIR_ABSOLUTE/usr/share/bit/package.json deb
cd $PACKAGE_TMPDIR_ABSOLUTE
eval "$FPM --output-type deb  --architecture noarch --depends nodejs --category 'Development/Languages' ."
mv $DEB_PACKAGE_NAME $BIT_PACKAGE_NAME
rm -rf ./usr