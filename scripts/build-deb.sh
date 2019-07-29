#!/bin/bash

set -ex

# Ensure all the tools we need are available
ensureAvailable() {
  command -v "$1" >/dev/null 2>&1 || (echo "You need to install $1" && exit 2)
}
ensureAvailable dpkg-deb
ensureAvailable fpm
ensureAvailable fakeroot
ensureAvailable rpmbuild

PACKAGE_DIST=$(cd $(dirname "$1") && pwd -P)/distribution
PACKAGE_TMPDIR=./tmp/linux
VERSION=$(cat ./package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | xargs echo -n)
TARBALL_NAME=./bit-$VERSION.tar.gz
BIT_PACKAGE_NAME="bit_${VERSION}_all.deb"
if [ ! -e $TARBALL_NAME ]; then
  echo "Hey! Listen! You need to run build-tar.sh first."
  exit 1
fi;



# Extract to a temporary directory
rm -rf $PACKAGE_TMPDIR
rm -rf $PACKAGE_DIST
mkdir ./distribution
mkdir -p $PACKAGE_TMPDIR/bit
umask 0022 # Ensure permissions are correct (0755 for dirs, 0644 for files)
tar zxf $TARBALL_NAME -C $PACKAGE_TMPDIR/bit
PACKAGE_TMPDIR_ABSOLUTE=$(cd $(dirname "$1") && pwd -P)/tmp/linux


# Create Linux package structure
cd $PACKAGE_TMPDIR_ABSOLUTE
mkdir -p ./usr/share/bit/
mv bit/* ./usr/share/bit/
rm -rf ./bit

pwd
# Common FPM parameters for all packages we'll build using FPM
FPM="fpm --input-type dir --chdir . --name bit --version $VERSION "`
  `"--vendor 'Cocycles, LTD <team@cocycles.com>' --maintainer 'Cocycles, LTD <team@cocycles.com>' "`
  `"--url https://bit.dev  --description 'Bit - Distributed Code Component Manager' --after-install ../../scripts/linux/postInstall.sh --after-remove ../../scripts/linux/postRemove.sh "

#### Build DEB (Debian, Ubuntu) package
node ../../scripts/set-installation-method.js $PACKAGE_TMPDIR_ABSOLUTE/usr/share/bit/package.json deb
eval "$FPM --output-type deb  --architecture noarch -p ../../distribution/   --depends gcc --depends make --depends python --depends g++ --category 'Development/Languages' ."
#mv $PACKAGE_DIST/$BIT_PACKAGE_NAME $PACKAGE_DIST/



# Common FPM parameters for all packages we'll build using FPM
FPM="fpm --input-type dir --chdir . --name bit --version $VERSION "`
  `"--vendor 'Cocycles, LTD <team@cocycles.com>' --maintainer 'Cocycles, LTD <team@cocycles.com>' "`
  `"--url https://bit.dev  --description 'Bit - Distributed Code Component Manager' --after-install ../../scripts/linux/postInstall.sh  --after-remove ../../scripts/linux/postRemove.sh "

#### Build RPM (Centos) package
node ../../scripts/set-installation-method.js $PACKAGE_TMPDIR_ABSOLUTE/usr/share/bit/package.json yum
eval "$FPM --output-type rpm  --architecture noarch -p ../../distribution/  --depends gcc --depends make --depends python --depends gcc-c++ --category 'Development/Languages' ."


rm -rf $PACKAGE_TMPDIR_ABSOLUTE/
